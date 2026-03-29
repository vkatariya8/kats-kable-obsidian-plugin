import { Article, SimilarArticle } from './types';
import { Database } from './database';

export class SimilarityEngine {
	private database: Database;
	private openaiApiKey: string;

	constructor(database: Database, openaiApiKey: string) {
		this.database = database;
		this.openaiApiKey = openaiApiKey;
	}

	/**
	 * Find similar articles from the archive
	 */
	async findSimilar(
		title: string, 
		commentary: string, 
		threshold: number = 0.6, 
		maxResults: number = 3
	): Promise<SimilarArticle[]> {
		if (!this.database.isLoaded()) {
			console.error('Database not loaded');
			return [];
		}

		const allArticles = this.database.getAllArticles();
		
		// Generate embedding for the new article
		const newArticleText = `${title}. ${commentary}`;
		const newEmbedding = await this.generateEmbedding(newArticleText);
		
		if (!newEmbedding) {
			console.error('Failed to generate embedding for new article');
			return [];
		}

		// Calculate similarity with all archived articles
		const similarities: SimilarArticle[] = [];
		
		for (const article of allArticles) {
			if (!article.embedding || article.embedding.length === 0) {
				continue;
			}
			
			const similarity = this.cosineSimilarity(newEmbedding, article.embedding);
			
			if (similarity >= threshold) {
				similarities.push({ article, similarity });
			}
		}

		// Sort by similarity (descending) and take top N
		similarities.sort((a, b) => b.similarity - a.similarity);
		return similarities.slice(0, maxResults);
	}

	/**
	 * Generate embedding using OpenAI API
	 */
	private async generateEmbedding(text: string): Promise<number[] | null> {
		try {
			const response = await fetch('https://api.openai.com/v1/embeddings', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.openaiApiKey}`
				},
				body: JSON.stringify({
					model: 'text-embedding-3-small',
					input: text
				})
			});

			if (!response.ok) {
				throw new Error(`OpenAI API error: ${response.status}`);
			}

			const data = await response.json();
			return data.data[0].embedding;
		} catch (error) {
			console.error('Error generating embedding:', error);
			return null;
		}
	}

	/**
	 * Calculate cosine similarity between two vectors
	 */
	private cosineSimilarity(vecA: number[], vecB: number[]): number {
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < vecA.length; i++) {
			dotProduct += vecA[i] * vecB[i];
			normA += vecA[i] * vecA[i];
			normB += vecB[i] * vecB[i];
		}

		if (normA === 0 || normB === 0) {
			return 0;
		}

		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}
}
