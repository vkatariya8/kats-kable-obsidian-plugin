import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Database, normalizeSource } from '../database';
import { SimilarArticle, Article } from '../types';

export const KATS_KABLE_VIEW_TYPE = 'kats-kable-sidebar';

// Top publications - sources outside this list are potential "repeat authors"
const TOP_PUBLICATIONS = new Set([
	'The Atlantic',
	'The Guardian',
	'New York Times',
	'Wired',
	'Atlas Obscura',
	'Nautilus',
	'The New Yorker',
	'Literary Hub',
	'BBC',
	'Longreads',
	'Vox',
	'Nature',
	'Medium',
	'Quanta Magazine',
	'Hakai Magazine',
	'Bloomberg',
	'New York Review',
	'Washington Post',
	'Aeon',
	'MIT Technology Review',
	'The Believer'
]);

export class KatsKableSidebarView extends ItemView {
	database: Database;
	onArticleClick: (article: Article) => void;
	settings: { maxSuggestions: number };

	constructor(
		leaf: WorkspaceLeaf,
		database: Database,
		onArticleClick: (article: Article) => void,
		settings: { maxSuggestions: number }
	) {
		super(leaf);
		this.database = database;
		this.onArticleClick = onArticleClick;
		this.settings = settings;
	}

	getViewType(): string {
		return KATS_KABLE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Kat\'s Kable Archive';
	}

	async onOpen(): Promise<void> {
		this.showEmptyState();
	}

	async onClose(): Promise<void> {
		// Clean up if needed
	}

	/**
	 * Check if a source is an individual writer (not a major publication)
	 */
	isIndividualWriter(source: string): boolean {
		const normalized = normalizeSource(source);
		if (!normalized) return false;
		return !TOP_PUBLICATIONS.has(normalized);
	}

	/**
	 * Get other articles by the same source (for repeat author feature)
	 */
	getOtherArticlesBySource(currentArticle: Article): Article[] {
		if (!this.database.isLoaded()) return [];
		
		const source = currentArticle.source?.trim();
		
		if (!source || source === '') return [];
		
		// Filter articles by same source, excluding current article
		return this.database.getArticlesBySource(source).filter(a => 
			a.id !== currentArticle.id
		).sort((a, b) => a.issue_number - b.issue_number);
	}

	showEmptyState() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		
		const emptyDiv = container.createDiv('kats-kable-sidebar-empty');
		emptyDiv.innerHTML = `
			<div style="
				text-align: center;
				padding: 40px 20px;
				color: var(--text-muted);
			">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.5;">
					<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
				</svg>
				<div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">
					Kat's Kable Archive Intelligence
				</div>
				<div style="font-size: 12px; line-height: 1.5;">
					Hover over an article link to see similar articles from your archive
				</div>
			</div>
		`;
	}

	populateSidebar(currentArticle: { title: string; url: string; source?: string }, similar: SimilarArticle[], repeatAuthorArticles?: Article[]) {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// Header section
		const header = container.createDiv('kats-kable-sidebar-header');
		header.innerHTML = `
			<div style="
				padding: 16px;
				border-bottom: 1px solid var(--background-modifier-border);
				background: var(--background-primary-alt);
			">
				<div style="
					font-size: 12px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
					color: var(--text-muted);
					margin-bottom: 8px;
				">
					Currently Viewing
				</div>
				<div style="
					font-size: 14px;
					font-weight: 500;
					line-height: 1.4;
					color: var(--text-normal);
				">
					${currentArticle.title}
				</div>
				<div style="
					font-size: 11px;
					color: var(--text-muted);
					margin-top: 4px;
					word-break: break-all;
				">
					${currentArticle.url.substring(0, 50)}${currentArticle.url.length > 50 ? '...' : ''}
				</div>
			</div>
		`;

		// REPEAT AUTHOR SECTION (if applicable)
		if (repeatAuthorArticles && repeatAuthorArticles.length > 0) {
			const repeatSection = container.createDiv('kats-kable-repeat-author');
			repeatSection.style.cssText = `
				background: linear-gradient(135deg, var(--background-primary-alt) 0%, var(--background-secondary) 100%);
				border-left: 3px solid var(--text-accent);
				margin: 8px;
				border-radius: 6px;
			`;
			
			repeatSection.innerHTML = `
				<div style="
					padding: 12px 16px;
					border-bottom: 1px solid var(--background-modifier-border);
				">
					<div style="
						display: flex;
						align-items: center;
						gap: 8px;
						margin-bottom: 8px;
					">
						<span style="font-size: 16px;">⚡</span>
						<span style="
							font-size: 11px;
							text-transform: uppercase;
							letter-spacing: 0.5px;
							color: var(--text-accent);
							font-weight: 600;
						">
							Repeat Author
						</span>
					</div>
					<div style="
						font-size: 13px;
						color: var(--text-normal);
						font-weight: 500;
					">
						${currentArticle.source || 'Unknown'}
					</div>
					<div style="
						font-size: 11px;
						color: var(--text-muted);
						margin-top: 4px;
					">
						You've shared ${repeatAuthorArticles.length} other article${repeatAuthorArticles.length !== 1 ? 's' : ''} by this author
					</div>
				</div>
			`;

			// List other articles by this author
			const repeatList = repeatSection.createDiv();
			repeatList.style.cssText = `
				padding: 8px;
				max-height: 200px;
				overflow-y: auto;
			`;

			repeatAuthorArticles.forEach(article => {
				const card = repeatList.createDiv('kats-kable-repeat-card');
				card.style.cssText = `
					padding: 8px 10px;
					margin-bottom: 6px;
					background: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					cursor: pointer;
					transition: all 0.15s ease;
				`;
				
				card.innerHTML = `
					<div style="
						display: flex;
						justify-content: space-between;
						align-items: center;
					">
						<span style="
							font-size: 11px;
							color: var(--text-accent);
							font-weight: 500;
						">
							Issue ${article.issue_number}
						</span>
					</div>
					<div style="
						font-size: 12px;
						color: var(--text-normal);
						margin-top: 4px;
						line-height: 1.3;
					">
						${article.title}
					</div>
				`;

				card.addEventListener('mouseenter', () => {
					card.style.background = 'var(--background-modifier-hover)';
					card.style.borderColor = 'var(--interactive-accent)';
				});
				
				card.addEventListener('mouseleave', () => {
					card.style.background = 'var(--background-primary)';
					card.style.borderColor = 'var(--background-modifier-border)';
				});

				card.addEventListener('click', () => {
					this.onArticleClick(article);
				});
			});
		}

		// Similar articles section
		const content = container.createDiv('kats-kable-sidebar-content');
		
		if (similar.length === 0) {
			content.innerHTML = `
				<div style="
					padding: 24px 16px;
					text-align: center;
					color: var(--text-muted);
				">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.4;">
						<circle cx="12" cy="12" r="10"/>
						<path d="M8 12h8"/>
					</svg>
					<div style="font-size: 13px;">
						No similar articles found
					</div>
					<div style="font-size: 11px; margin-top: 8px; opacity: 0.7;">
						Try lowering the similarity threshold in settings
					</div>
				</div>
			`;
		} else {
			const sectionHeader = content.createDiv();
			sectionHeader.innerHTML = `
				<div style="
					padding: 12px 16px;
					font-size: 11px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
					color: var(--text-muted);
					border-bottom: 1px solid var(--background-modifier-border);
				">
					${similar.length} Similar Article${similar.length !== 1 ? 's' : ''} from Archive
				</div>
			`;

			const listContainer = content.createDiv();
			listContainer.style.padding = '8px';

			similar.forEach((item, index) => {
				const article = item.article;
				const simScore = item.similarity;
				
				const card = listContainer.createDiv('kats-kable-article-card');
				card.style.cssText = `
					padding: 12px;
					margin-bottom: 8px;
					background: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.15s ease;
				`;
				
				card.innerHTML = `
					<div style="
						display: flex;
						justify-content: space-between;
						align-items: flex-start;
						margin-bottom: 6px;
					">
						<div style="
							font-size: 11px;
							color: var(--text-accent);
							font-weight: 500;
						">
							Issue ${article.issue_number}
						</div>
						<div style="
							font-size: 10px;
							color: var(--text-muted);
							background: var(--background-modifier-hover);
							padding: 2px 6px;
							border-radius: 3px;
						">
							${(simScore * 100).toFixed(0)}%
						</div>
					</div>
					<div style="
						font-size: 13px;
						font-weight: 500;
						line-height: 1.4;
						color: var(--text-normal);
						margin-bottom: 4px;
					">
						${article.title}
					</div>
					<div style="
						font-size: 11px;
						color: var(--text-muted);
						line-height: 1.3;
					">
						${article.source || 'Unknown'}
					</div>
				`;

				card.addEventListener('mouseenter', () => {
					card.style.background = 'var(--background-modifier-hover)';
					card.style.borderColor = 'var(--interactive-accent)';
				});
				
				card.addEventListener('mouseleave', () => {
					card.style.background = 'var(--background-primary)';
					card.style.borderColor = 'var(--background-modifier-border)';
				});

				card.addEventListener('click', () => {
					this.onArticleClick(article);
				});
			});
		}

		// Footer with stats
		if (this.database.isLoaded()) {
			const footer = container.createDiv('kats-kable-sidebar-footer');
			footer.innerHTML = `
				<div style="
					padding: 12px 16px;
					border-top: 1px solid var(--background-modifier-border);
					font-size: 11px;
					color: var(--text-muted);
					text-align: center;
				">
					${this.database.getAllArticles().length} articles in archive
				</div>
			`;
		}
	}
}
