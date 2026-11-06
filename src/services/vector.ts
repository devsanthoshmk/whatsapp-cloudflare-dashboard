/**
 * Vector DB / RAG Engine for Cloudflare Workers
 * Performs L2 vector normalization and ultra-fast in-memory cosine similarity
 * calculations over pre-normalized floating point vectors in D1.
 */

export class VectorEngine {
  /**
   * Computes the L2 (Euclidean) norm of a numeric vector.
   * ||V||_2 = sqrt(sum(v_i^2))
   */
  static l2Norm(vec: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
  }

  /**
   * Normalizes a vector to unit length (L2 norm = 1.0).
   * Ensures cosine similarity collapses to a simple dot product.
   */
  static normalize(vec: number[]): number[] {
    const norm = this.l2Norm(vec);
    if (norm === 0 || Math.abs(norm - 1.0) < 1e-9) {
      return [...vec];
    }
    const inv = 1.0 / norm;
    const normalized = new Array<number>(vec.length);
    for (let i = 0; i < vec.length; i++) {
      normalized[i] = vec[i] * inv;
    }
    return normalized;
  }

  /**
   * Computes the dot product between two vectors.
   * If both vectors are pre-normalized, dotProduct(a, b) === cosineSimilarity(a, b).
   */
  static dotProduct(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Dimension mismatch in dot product: ${a.length} !== ${b.length}`);
    }
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * Computes standard cosine similarity between any two vectors.
   * If they are already normalized, passes directly through dot product.
   */
  static cosineSimilarity(a: number[], b: number[], areNormalized: boolean = false): number {
    if (a.length !== b.length) {
      throw new Error(`Dimension mismatch: vector A (${a.length}) != vector B (${b.length})`);
    }
    if (areNormalized) {
      return this.dotProduct(a, b);
    }
    const normA = this.l2Norm(a);
    const normB = this.l2Norm(b);
    if (normA === 0 || normB === 0) return 0;
    return this.dotProduct(a, b) / (normA * normB);
  }

  /**
   * Deterministic embedding vector generator for testing and offline harness validation.
   * Produces a reproducible, normalized pseudo-embedding vector of specified dimension
   * from any text without needing external LLM API calls.
   */
  static generateDeterministicEmbedding(text: string, dimension: number = 384): number[] {
    const raw = new Array<number>(dimension).fill(0);
    const cleanText = (text || '').trim().toLowerCase();
    
    // Hash sliding n-grams into vector dimensions
    let seed = 0x811c9dc5;
    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText.charCodeAt(i);
      seed ^= char;
      seed = (seed * 0x01000193) >>> 0;
      
      const bucket = (seed + i) % dimension;
      const weight = ((char % 10) + 1) / 10;
      raw[bucket] += (seed % 2 === 0 ? 1 : -1) * weight;
    }

    // Add positional token weight
    const tokens = cleanText.split(/\s+/);
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      let tokHash = 0;
      for (let c = 0; c < tok.length; c++) {
        tokHash = ((tokHash << 5) - tokHash + tok.charCodeAt(c)) | 0;
      }
      const idx = Math.abs(tokHash) % dimension;
      raw[idx] += 1.5;
    }

    return this.normalize(raw);
  }

  /**
   * Sorts candidate embeddings and returns top-K results with score >= minSimilarity.
   */
  static searchTopK<T>(
    queryVector: number[],
    candidates: Array<{ vector: number[]; isNormalized?: boolean; payload: T }>,
    topK: number = 5,
    minSimilarity: number = 0.5
  ): Array<{ payload: T; similarity: number }> {
    const normQuery = this.normalize(queryVector);
    const scored: Array<{ payload: T; similarity: number }> = [];

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (cand.vector.length !== normQuery.length) continue;

      const normCand = cand.isNormalized ? cand.vector : this.normalize(cand.vector);
      const similarity = this.dotProduct(normQuery, normCand);

      if (similarity >= minSimilarity) {
        scored.push({ payload: cand.payload, similarity: Number(similarity.toFixed(4)) });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }
}
