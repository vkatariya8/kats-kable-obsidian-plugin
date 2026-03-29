import { App, Editor, MarkdownView, EditorPosition, TFile, WorkspaceLeaf } from 'obsidian';
import { Database } from '../database';
import { SimilarityEngine } from '../similarity';
import { ArticleParser } from '../parser';
import { SimilarArticle, Article } from '../types';

export class HoverPopup {
	private app: App;
	private database: Database;
	private similarityEngine: SimilarityEngine;
	private settings: { similarityThreshold: number; maxSuggestions: number };
	private parser: ArticleParser;

	constructor(
		app: App, 
		database: Database, 
		similarityEngine: SimilarityEngine, 
		settings: { similarityThreshold: number; maxSuggestions: number }
	) {
		this.app = app;
		this.database = database;
		this.similarityEngine = similarityEngine;
		this.settings = settings;
		this.parser = new ArticleParser();
	}

	/**
	 * Initialize hover event listeners on the active leaf
	 */
	initializeHoverListeners() {
		// Register global hover event on document (for reading mode)
		document.addEventListener('mouseover', this.handleMouseOver.bind(this));
	}

	/**
	 * Create CodeMirror editor extension for editing mode hover detection
	 */
	createEditorExtension(): any {
		const self = this;
		
		// Import CodeMirror modules dynamically
		const { EditorView } = require('@codemirror/view');
		
		return EditorView.domEventHandlers({
			mousemove(event: MouseEvent, view: any) {
				// Get position from mouse event
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos === null) return false;
				
				// Get the line at this position
				const line = view.state.doc.lineAt(pos);
				const lineText = line.text;
				
				// Check if this line contains a markdown link
				const linkMatch = lineText.match(/\[([^\]]+)\]\(([^)]+)\)/);
				if (!linkMatch) return false;
				
				const title = linkMatch[1];
				const url = linkMatch[2];
				
				// Verify it's an external link
				if (!url.startsWith('http')) return false;
				
				// Check if we're hovering near the link (within the line)
				const lineStart = line.from;
				const relativePos = pos - lineStart;
				const linkStart = linkMatch.index || 0;
				const linkEnd = linkStart + linkMatch[0].length;
				
				// Allow hover anywhere on the line containing the link
				if (relativePos >= linkStart - 5 && relativePos <= linkEnd + 5) {
					console.log(`Kat's Kable: Editor mode hover detected on line with link: "${title.substring(0, 40)}..."`);
					
					// Debounce
					if ((window as any)._katsKableEditorTimeout) {
						clearTimeout((window as any)._katsKableEditorTimeout);
					}
					
					(window as any)._katsKableEditorTimeout = setTimeout(async () => {
						// Make sure mouse is still in same area
						const currentPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
						if (currentPos === null) return;
						
						const currentLine = view.state.doc.lineAt(currentPos);
						if (currentLine.number !== line.number) return;
						
						const similar = await self.similarityEngine.findSimilar(
							title,
							'',
							self.settings.similarityThreshold,
							self.settings.maxSuggestions
						);
						
						console.log(`Kat's Kable: Editor mode found ${similar.length} similar articles`);
						
						if (similar.length > 0) {
							self.showEditorModePopup(title, url, similar, event.clientX, event.clientY);
						}
					}, 300);
					
					return true;
				}
				
				return false;
			}
		});
	}

	/**
	 * Handle mouse over event to detect article links
	 */
	private async handleMouseOver(event: MouseEvent) {
		const target = event.target as HTMLElement;
		
		// Check if hovering over a link (external-link is for http/https URLs)
		// Obsidian may use different classes depending on view mode
		const isLink = target.matches('a.external-link, a[href^="http"], a[href^="https"]');
		
		if (!isLink) {
			return;
		}

		const linkText = target.textContent || '';
		const linkHref = target.getAttribute('href') || '';
		
		console.log(`Kat's Kable: Hover detected on link: "${linkText.substring(0, 50)}..." -> ${linkHref.substring(0, 60)}...`);

		// Only process if it looks like an article link
		if (!this.isLikelyArticleLink(linkHref)) {
			console.log(`Kat's Kable: Not an article link (doesn't start with http)`);
			return;
		}

		console.log(`Kat's Kable: Article link detected, processing...`);

		// Debounce: clear any existing timeout
		if ((target as any)._katsKableTimeout) {
			clearTimeout((target as any)._katsKableTimeout);
		}

		// Set new timeout to show popup after 500ms hover
		(target as any)._katsKableTimeout = setTimeout(async () => {
			// Check if still hovering
			if (!target.matches(':hover')) {
				console.log(`Kat's Kable: No longer hovering, canceling`);
				return;
			}

			// Parse the article
			const article = this.parser.parseLine(`[${linkText}](${linkHref})`);
			
			if (!article) {
				console.log(`Kat's Kable: Could not parse article from link`);
				return;
			}
			
			console.log(`Kat's Kable: Parsed article: "${article.title.substring(0, 50)}..."`);
			console.log(`Kat's Kable: Searching for similar articles...`);

			// Find similar articles
			const similar = await this.similarityEngine.findSimilar(
				article.title,
				'', // We don't have commentary for the new article yet
				this.settings.similarityThreshold,
				this.settings.maxSuggestions
			);

			console.log(`Kat's Kable: Found ${similar.length} similar articles`);

			if (similar.length === 0) {
				console.log(`Kat's Kable: No similar articles above threshold ${this.settings.similarityThreshold}`);
				return;
			}

			if (similar.length === 0) {
				return;
			}

			// Show hover popup
			this.showHoverPopup(target, similar);
		}, 500);
	}

	/**
	 * Check if a URL looks like an article link (not internal Obsidian link)
	 */
	private isLikelyArticleLink(url: string): boolean {
	// Must be http/https URL
		return url.startsWith('http://') || url.startsWith('https://');
	}

	/**
	 * Show hover popup with similar articles
	 */
	private showHoverPopup(target: HTMLElement, similar: SimilarArticle[]) {
		// Remove any existing popup
		this.removeExistingPopup();

		const popup = document.createElement('div');
		popup.className = 'kats-kable-popup';
		popup.innerHTML = this.createPopupContent(similar);
		
		// Position popup near the target
		const rect = target.getBoundingClientRect();
		popup.style.position = 'fixed';
		popup.style.left = `${rect.left}px`;
		popup.style.top = `${rect.bottom + 5}px`;
		popup.style.zIndex = '1000';
		
		document.body.appendChild(popup);
		
		// Add click handlers for each suggestion
		popup.querySelectorAll('.kats-kable-suggestion').forEach((suggestionEl, index) => {
			suggestionEl.addEventListener('click', () => {
				this.insertLink(similar[index].article);
				this.removeExistingPopup();
			});
		});
		
		// Remove popup when mouse leaves
		const removeOnLeave = (e: MouseEvent) => {
			if (!popup.contains(e.target as Node) && e.target !== target) {
				this.removeExistingPopup();
				document.removeEventListener('click', removeOnLeave);
			}
		};
		
		setTimeout(() => {
			document.addEventListener('click', removeOnLeave);
		}, 100);
	}

	/**
	 * Remove any existing popup
	 */
	private removeExistingPopup() {
		const existing = document.querySelector('.kats-kable-popup');
		if (existing) {
			existing.remove();
		}
	}

	/**
	 * Show popup in editor mode (positioned near cursor)
	 */
	private showEditorModePopup(title: string, url: string, similar: SimilarArticle[], x: number, y: number) {
		this.removeExistingPopup();

		const popup = document.createElement('div');
		popup.className = 'kats-kable-popup kats-kable-editor-popup';
		popup.innerHTML = this.createPopupContent(similar);
		
		// Position at cursor location with offset
		popup.style.position = 'fixed';
		popup.style.left = `${x}px`;
		popup.style.top = `${y + 20}px`;
		popup.style.zIndex = '1000';
		
		document.body.appendChild(popup);
		
		// Add click handlers
		popup.querySelectorAll('.kats-kable-suggestion').forEach((suggestionEl, index) => {
			suggestionEl.addEventListener('click', () => {
				this.insertLink(similar[index].article);
				this.removeExistingPopup();
			});
		});
		
		// Remove on click outside
		const removeOnClickOutside = (e: MouseEvent) => {
			if (!popup.contains(e.target as Node)) {
				this.removeExistingPopup();
				document.removeEventListener('click', removeOnClickOutside);
			}
		};
		
		setTimeout(() => {
			document.addEventListener('click', removeOnClickOutside);
		}, 100);
		
		// Auto-remove after 8 seconds
		setTimeout(() => {
			this.removeExistingPopup();
			document.removeEventListener('click', removeOnClickOutside);
		}, 8000);
	}

	/**
	 * Create HTML content for popup (Option A: Compact list)
	 */
	private createPopupContent(similar: SimilarArticle[]): string {
		let html = '<div class="kats-kable-popup-content">';
		html += '<div class="kats-kable-popup-header">Similar articles from your archive:</div>';
		html += '<div class="kats-kable-popup-list">';
		
		for (const item of similar) {
			const article = item.article;
			html += `
				<div class="kats-kable-suggestion" data-issue="${article.issue_number}" data-url="${article.url}">
					<span class="kats-kable-bullet">•</span>
					<span class="kats-kable-text">
						Issue ${article.issue_number}: "${article.title}" by ${article.source || 'Unknown'}
					</span>
				</div>
			`;
		}
		
		html += '</div></div>';
		return html;
	}

	/**
	 * Insert formatted link into editor
	 */
	private insertLink(article: Article) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			return;
		}

		const editor = activeView.editor;
		const cursor = editor.getCursor();
		
		// Format: [ARTICLE TITLE](ARTICLE URL) from issue ISSUE_NO
		const linkText = `[${article.title}](${article.url}) from issue ${article.issue_number}`;
		
		// Insert at cursor position with a newline before
		const insertText = `\n${linkText}\n`;
		editor.replaceRange(insertText, cursor);
		
		// Move cursor after inserted text
		const newCursor = {
			line: cursor.line + 1,
			ch: insertText.length - 1
		};
		editor.setCursor(newCursor);
		
		// Show notice
		// Notice.show(`Inserted link to Issue ${article.issue_number}`);
	}

	/**
	 * Show results in a modal (for command palette)
	 */
	showResultsModal(similar: SimilarArticle[]) {
		// Remove existing modal
		this.removeExistingModal();

		const modal = document.createElement('div');
		modal.className = 'kats-kable-modal';
		modal.innerHTML = `
			<div class="kats-kable-modal-content">
				${this.createPopupContent(similar)}
				<button class="kats-kable-close-btn">Close</button>
			</div>
		`;
		
		document.body.appendChild(modal);
		
		// Close button handler
		modal.querySelector('.kats-kable-close-btn')?.addEventListener('click', () => {
			modal.remove();
		});
		
		// Click outside to close
		modal.addEventListener('click', (e) => {
			if (e.target === modal) {
				modal.remove();
			}
		});
		
		// Add click handlers for suggestions
		modal.querySelectorAll('.kats-kable-suggestion').forEach((el, index) => {
			el.addEventListener('click', () => {
				this.insertLink(similar[index].article);
				modal.remove();
			});
		});
	}

	/**
	 * Remove existing modal
	 */
	private removeExistingModal() {
		const existing = document.querySelector('.kats-kable-modal');
		if (existing) {
			existing.remove();
		}
	}
}
