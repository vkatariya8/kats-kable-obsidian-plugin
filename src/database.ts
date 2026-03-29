import { Article } from './types';

export class Database {
	private articles: Article[] = [];
	private loaded: boolean = false;

	async load(jsonPath: string): Promise<boolean> {
		try {
			// Use Obsidian's adapter to read file
			const fs = require('fs');
			
			if (!fs.existsSync(jsonPath)) {
				return false;
			}

			const data = fs.readFileSync(jsonPath, 'utf8');
			this.articles = JSON.parse(data);
			
			// Validate articles have required fields
			this.articles = this.articles.filter(a => 
				a.id && a.issue_number && a.title && a.url
			);
			
			this.loaded = true;
			console.log(`Loaded ${this.articles.length} articles from ${jsonPath}`);
			return true;
			
		} catch (error) {
			console.error('Error loading database:', error);
			return false;
		}
	}

	getAllArticles(): Article[] {
		return this.articles;
	}

	getArticleById(id: number): Article | undefined {
		return this.articles.find(a => a.id === id);
	}

	getArticlesByIssue(issueNumber: number): Article[] {
		return this.articles.filter(a => a.issue_number === issueNumber);
	}

	isLoaded(): boolean {
		return this.loaded;
	}

	getStats() {
		return {
			total: this.articles.length,
			withEmbeddings: this.articles.filter(a => a.embedding && a.embedding.length > 0).length,
			issueRange: this.articles.length > 0 ? {
				min: Math.min(...this.articles.map(a => a.issue_number)),
				max: Math.max(...this.articles.map(a => a.issue_number))
			} : null
		};
	}
}
