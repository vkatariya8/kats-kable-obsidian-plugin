export interface Article {
	id: number;
	issue_number: number;
	date: string;
	position: number;
	title: string;
	url: string;
	source: string;
	commentary: string;
	embedding: number[] | null;
}

export interface ParsedArticle {
	title: string;
	url: string;
	commentary?: string;
}

export interface SimilarArticle {
	article: Article;
	similarity: number;
}
