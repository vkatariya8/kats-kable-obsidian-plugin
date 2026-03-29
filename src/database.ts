import { Article } from './types';

// Known publication names (first words) - if we see these, stop there
const KNOWN_PUBLICATIONS = new Set([
	'Aeon', 'The', 'New', 'BBC', 'Vox', 'Wired', 'Nature', 'Medium',
	'Quanta', 'Hakai', 'Bloomberg', 'Mosaicscience', 'Citylab', 'Vice',
	'Atlas', 'Nautilus', 'Literary', 'Longreads', 'Topic', 'Tor.com',
	'MIT', 'Mosaic', 'Psyche', 'HBR', 'Comment'
]);

// Special multi-word publications that should be preserved fully
const SPECIAL_PUBLICATIONS = new Set([
	'The Convivial Society',
	'New York Times',
	'The New Yorker',
	'New York Review of Books',
	'The Atlantic',
	'The Guardian',
	'Atlas Obscura',
	'The Paris Review',
	'MIT Technology Review',
	'Washington Post',
	'Quanta Magazine'
]);

/**
 * Normalize a source string to handle dirty data
 * Extracts the clean publication name from sources that have commentary mixed in
 */
export function normalizeSource(source: string): string {
	if (!source || source.trim() === '') return '';
	
	const trimmed = source.trim();
	const lower = trimmed.toLowerCase();
	
	// Check for special multi-word publications first
	for (const special of SPECIAL_PUBLICATIONS) {
		if (lower.startsWith(special.toLowerCase())) {
			return special;
		}
	}
	
	const words = trimmed.split(/\s+/);
	
	if (words.length === 0) return '';
	
	// Check if first word is a known publication
	if (KNOWN_PUBLICATIONS.has(words[0])) {
		// Special cases for multi-word publications starting with 'The' or 'New'
		if (words[0] === 'The' && words.length > 1) {
			// Could be 'The Atlantic', 'The Guardian', 'The New Yorker', etc.
			if (words[1] === 'New' && words.length > 2) {
				// Could be 'New York Times' or 'New Yorker'
				if (words[2] === 'York' && words.length > 3) {
					return 'The New York Times';
				} else if (words[2] === 'Yorker') {
					return 'The New Yorker';
				}
			}
			// Other "The X" publications - take first 2 words
			return words.slice(0, 2).join(' ').replace(/[^\w\s]+$/g, '');
		}
		if (words[0] === 'New' && words.length > 1) {
			// Could be 'New York Times' or 'New York Review'
			if (words[1] === 'York' && words.length > 2) {
				if (words[2] === 'Times') {
					return 'New York Times';
				} else if (words[2] === 'Review' && words.length > 3 && words[3] === 'of') {
					return 'New York Review of Books';
				}
			}
		}
		// Single-word publication
		return words[0];
	}
	
	// If not a known publication, take first 1-3 words
	const cleanWords = words.slice(0, Math.min(3, words.length));
	let clean = cleanWords.join(' ');
	
	// Remove punctuation at end
	clean = clean.replace(/[^\w\s]+$/g, '');
	
	return clean;
}

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

	getArticleByUrl(url: string): Article | undefined {
		return this.articles.find(a => a.url === url);
	}

	getArticlesByUrl(url: string): Article[] {
		return this.articles.filter(a => a.url === url);
	}

	getArticlesBySource(source: string): Article[] {
		const normalizedSource = normalizeSource(source);
		if (!normalizedSource) return [];
		
		return this.articles.filter(a => {
			const articleSource = normalizeSource(a.source || '');
			return articleSource === normalizedSource;
		});
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
