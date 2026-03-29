import { ParsedArticle } from './types';

export class ArticleParser {
	/**
	 * Parse a markdown line to extract article title and URL
	 * Matches patterns like: [Title](URL) or [Title](URL) - Source
	 */
	parseLine(line: string): ParsedArticle | null {
		// Match markdown link pattern: [title](url)
		const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
		const match = line.match(linkRegex);
		
		if (match) {
			return {
				title: match[1].trim(),
				url: match[2].trim()
			};
		}
		
		return null;
	}

	/**
	 * Extract all articles from a markdown file content
	 */
	parseContent(content: string): ParsedArticle[] {
		const articles: ParsedArticle[] = [];
		const lines = content.split('\n');
		
		for (const line of lines) {
			const article = this.parseLine(line);
			if (article) {
				articles.push(article);
			}
		}
		
		return articles;
	}
}
