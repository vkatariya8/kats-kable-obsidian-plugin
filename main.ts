import { Plugin, TFile, Editor, MarkdownView, EditorPosition, Notice, WorkspaceLeaf } from 'obsidian';
import { Database, normalizeSource } from './src/database';
import { ArticleParser } from './src/parser';
import { SimilarityEngine } from './src/similarity';
import { KatsKableSettingTab } from './src/settings';
import { KatsKableSidebarView, KATS_KABLE_VIEW_TYPE } from './src/ui/sidebarView';
import { Article } from './src/types';

// Top publications - sources outside this list are potential "repeat authors"
// Expanded based on analysis of current database
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

interface KatsKableSettings {
	similarityThreshold: number;
	maxSuggestions: number;
	openaiApiKey: string;
}

const DEFAULT_SETTINGS: KatsKableSettings = {
	similarityThreshold: 0.4,
	maxSuggestions: 3,
	openaiApiKey: ''
};

export default class KatsKablePlugin extends Plugin {
	settings: KatsKableSettings;
	database: Database;
	parser: ArticleParser;
	similarityEngine: SimilarityEngine;
	sidebarView: KatsKableSidebarView | null = null;
	lastActiveMarkdownView: MarkdownView | null = null;

	async onload() {
		console.log('Loading Kat\'s Kable Plugin...');
		
		// Load settings
		await this.loadSettings();
		
		// Try to load API key from .env file if not in settings
		if (!this.settings.openaiApiKey) {
			await this.loadApiKeyFromEnvFile();
		}
		
		// Check for API key
		if (!this.settings.openaiApiKey) {
			new Notice('Kat\'s Kable: Please set your OpenAI API key in settings or .env file', 5000);
			console.log('Kat\'s Kable: No API key found');
		} else {
			console.log('Kat\'s Kable: API key loaded successfully');
		}
		
		// Initialize components
		this.database = new Database();
		this.parser = new ArticleParser();
		this.similarityEngine = new SimilarityEngine(this.database, this.settings.openaiApiKey);
		
		// Register the sidebar view
		this.registerView(
			KATS_KABLE_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => {
				this.sidebarView = new KatsKableSidebarView(
					leaf,
					this.database,
					(article: Article) => this.insertArticleLink(article),
					{ maxSuggestions: this.settings.maxSuggestions }
				);
				return this.sidebarView;
			}
		);
		
		// Load database
		await this.loadDatabase();
		
		// Open the sidebar on the right (wait for workspace to be ready)
		this.app.workspace.onLayoutReady(async () => {
			await this.openSidebar();
		});
		
		// Initialize hover listeners (populate sidebar on hover)
		this.initializeHoverListeners();
		
		// Register editor extension (for editing mode hover)
		this.registerEditorExtension(this.createEditorExtension());
		
		// Track the last active markdown editor for sidebar insertions
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf && leaf.view instanceof MarkdownView) {
					this.lastActiveMarkdownView = leaf.view;
					console.log('Kat\'s Kable: Tracked active markdown editor');
				}
			})
		);
		
		// Also track on initial load
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
			this.lastActiveMarkdownView = activeLeaf.view;
		}
		
		// Add command palette command
		this.addCommand({
			id: 'find-similar-articles',
			name: 'Find similar articles from archive',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.showSimilarArticlesForCurrentLine(editor, view);
			}
		});
		
		// Add command to open/close sidebar
		this.addCommand({
			id: 'toggle-kats-kable-sidebar',
			name: 'Toggle Kat\'s Kable sidebar',
			callback: () => {
				this.toggleSidebar();
			}
		});
		
		// Add settings tab
		this.addSettingTab(new KatsKableSettingTab(this.app, this));
		
		console.log('Kat\'s Kable Plugin loaded successfully');
		
		// Show notice when ready
		if (this.database.isLoaded()) {
			new Notice(`Kat's Kable: Loaded ${this.database.getAllArticles().length} articles. Sidebar is open on the right.`, 4000);
		}
	}

	onunload() {
		console.log('Unloading Kat\'s Kable Plugin...');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openSidebar(): Promise<void> {
		const { workspace } = this.app;
		
		// Check if sidebar is already open
		const existingLeaf = workspace.getLeavesOfType(KATS_KABLE_VIEW_TYPE)[0];
		if (existingLeaf) {
			workspace.revealLeaf(existingLeaf);
			return;
		}
		
		// Create new leaf on the right sidebar
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: KATS_KABLE_VIEW_TYPE, active: true });
			workspace.revealLeaf(leaf);
		}
	}

	async toggleSidebar(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(KATS_KABLE_VIEW_TYPE);
		
		if (leaves.length > 0) {
			// Close sidebar
			leaves.forEach(leaf => leaf.detach());
			this.sidebarView = null;
		} else {
			// Open sidebar
			await this.openSidebar();
		}
	}

	async loadApiKeyFromEnvFile(): Promise<boolean> {
		try {
			// Get the plugin directory from manifest
			const pluginDir = this.manifest.dir;
			if (!pluginDir) {
				console.log('Kat\'s Kable: Could not determine plugin directory');
				return false;
			}

			// Get vault path and construct absolute plugin path
			const vaultPath = (this.app.vault.adapter as any).basePath || 
				this.app.vault.adapter.getResourcePath('').replace(/\/[^\/]*$/, '');
			
			const path = require('path');
			const absolutePluginDir = path.isAbsolute(pluginDir) 
				? pluginDir 
				: path.join(vaultPath, pluginDir);
			
			// Try to read .env file using Node's fs
			const fs = require('fs');
			const envPath = path.join(absolutePluginDir, '.env');
			
			console.log(`Kat\'s Kable: Looking for .env file at: ${envPath}`);
			
			if (!fs.existsSync(envPath)) {
				console.log(`Kat\'s Kable: .env file not found at ${envPath}`);
				return false;
			}
			
			const envContent = fs.readFileSync(envPath, 'utf8');
			console.log('Kat\'s Kable: Found .env file, parsing...');
			
			// Parse .env file
			const lines = envContent.split('\n');
			for (const line of lines) {
				const trimmedLine = line.trim();
				// Skip comments and empty lines
				if (!trimmedLine || trimmedLine.startsWith('#')) {
					continue;
				}
				
				// Parse KEY=VALUE format
				const equalIndex = trimmedLine.indexOf('=');
				if (equalIndex > 0) {
					const key = trimmedLine.substring(0, equalIndex).trim();
					const value = trimmedLine.substring(equalIndex + 1).trim();
					
					if (key === 'OPENAI_API_KEY' && value) {
						this.settings.openaiApiKey = value;
						console.log(`Kat\'s Kable: Loaded API key from .env file`);
						return true;
					}
				}
			}
			
			console.log('Kat\'s Kable: No OPENAI_API_KEY found in .env file');
			return false;
			
		} catch (error) {
			console.error('Kat\'s Kable: Error loading .env file:', error);
			return false;
		}
	}

	async loadDatabase() {
		// Find database file in multiple possible locations
		const pluginDir = this.manifest.dir || '';
		const vaultPath = (this.app.vault.adapter as any).basePath || this.app.vault.adapter.getResourcePath('').replace(/\/[^\/]*$/, '');
		const possiblePaths = [
			`${pluginDir}/kats_kable_full_export.json`,
			`${pluginDir}/../kats_kable_full_export.json`,
			`${pluginDir}/../../kats_kable_full_export.json`,
			`${vaultPath}/kats_kable_full_export.json`,
			`${vaultPath}/../kats_kable_full_export.json`,
			'/Users/kat/Documents/kats_kable_temp/kats_kable_full_export.json',
			// Fallback to old database
			`${pluginDir}/kats_kable_export.json`,
			`${vaultPath}/kats_kable_export.json`
		];
		
		for (const jsonPath of possiblePaths) {
			if (await this.database.load(jsonPath)) {
				console.log(`Database loaded from: ${jsonPath}`);
				return;
			}
		}
		
		console.error('Could not find kats_kable_full_export.json database export');
		new Notice('Kat\'s Kable: Database not found. Please ensure kats_kable_full_export.json is in your vault.', 5000);
	}

	/**
	 * Insert formatted link into editor
	 */
	insertArticleLink(article: Article) {
		// Use the tracked last active markdown view (in case focus moved to sidebar)
		const targetView = this.lastActiveMarkdownView || this.app.workspace.getActiveViewOfType(MarkdownView);
		
		if (!targetView) {
			new Notice('No markdown editor found. Please click in a document first.', 3000);
			return;
		}

		const editor = targetView.editor;
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
		
		new Notice(`Inserted link to Issue ${article.issue_number}`, 2000);
	}

	/**
	 * Check if a source is an individual writer (not a major publication)
	 * Uses normalized source names to handle dirty data
	 */
	isIndividualWriter(source: string): boolean {
		const normalized = normalizeSource(source);
		if (!normalized) return false;
		return !TOP_PUBLICATIONS.has(normalized);
	}

	/**
	 * Get other articles by the same source (for repeat author feature)
	 */
	getOtherArticlesBySource(source: string, excludeUrl?: string): Article[] {
		if (!this.database.isLoaded()) return [];
		
		const sourceTrimmed = source?.trim();
		
		if (!sourceTrimmed || sourceTrimmed === '') return [];
		
		// Use the database method for efficient lookup
		return this.database.getArticlesBySource(sourceTrimmed).filter(a => 
			(!excludeUrl || a.url !== excludeUrl)
		).sort((a, b) => a.issue_number - b.issue_number);
	}

	/**
	 * Initialize hover listeners for reading mode
	 */
	initializeHoverListeners() {
		document.addEventListener('mouseover', this.handleReadingModeHover.bind(this));
	}

	/**
	 * Handle hover in reading mode - populate sidebar with similar and repeat author info
	 */
	private async handleReadingModeHover(event: MouseEvent) {
		const target = event.target as HTMLElement;
		
		// Check if hovering over a link
		const isLink = target.tagName === 'A' && (
			target.classList.contains('external-link') ||
			target.getAttribute('href')?.startsWith('http')
		);
		
		if (!isLink) {
			return;
		}

		const linkText = target.textContent || '';
		const linkHref = target.getAttribute('href') || '';
		
		if (!linkHref.startsWith('http')) {
			return;
		}

		// Debounce
		if ((window as any)._katsKableHoverTimeout) {
			clearTimeout((window as any)._katsKableHoverTimeout);
		}

		(window as any)._katsKableHoverTimeout = setTimeout(async () => {
			if (!target.matches(':hover')) {
				return;
			}

			// Check if we have sidebar
			if (!this.sidebarView) {
				return;
			}

			// Find similar articles
			const similar = await this.similarityEngine.findSimilar(
				linkText,
				'',
				this.settings.similarityThreshold,
				this.settings.maxSuggestions
			);

			// Look up article in database by URL to get source for repeat author detection
			let repeatAuthorArticles: Article[] = [];
			let articleSource = '';
			
			const matchingArticle = this.database.getArticleByUrl(linkHref);
			
			if (matchingArticle) {
				articleSource = matchingArticle.source || '';
				if (articleSource && this.isIndividualWriter(articleSource)) {
					repeatAuthorArticles = this.getOtherArticlesBySource(articleSource, linkHref);
					if (repeatAuthorArticles.length > 0) {
						console.log(`Kat's Kable: Found ${repeatAuthorArticles.length} other articles by ${articleSource} in reading mode`);
					}
				}
			}

			// Populate sidebar
			this.sidebarView.populateSidebar(
				{ title: linkText, url: linkHref, source: articleSource },
				similar,
				repeatAuthorArticles
			);
		}, 300);
	}

	/**
	 * Create CodeMirror editor extension for editing mode
	 */
	createEditorExtension(): any {
		const self = this;
		const { EditorView } = require('@codemirror/view');
		
		return EditorView.domEventHandlers({
			mousemove(event: MouseEvent, view: any) {
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos === null) return false;
				
				const currentLine = view.state.doc.lineAt(pos);
				
				// Look for article link - first check current line, then look upwards
				let targetLine = currentLine;
				let linkMatch = null;
				let linesChecked = 0;
				const maxLinesToCheck = 20; // Don't look too far up
				
				while (linesChecked < maxLinesToCheck && targetLine.number > 1) {
					const lineText = targetLine.text;
					
					// Check if this line contains a markdown link
					linkMatch = lineText.match(/\[([^\]]+)\]\(([^)]+)\)/);
					
					if (linkMatch) {
						const url = linkMatch[2];
						// Make sure it's an external link (article)
						if (url.startsWith('http')) {
							break; // Found the article link
						}
					}
					
					// Stop if we hit an article separator (* * *) or new article marker
					if (lineText.includes('* * *') || lineText.match(/^\*\*\d+\*\*/)) {
						// We've gone too far up - we're in a different article section
						// Look back down to find the article link
						break;
					}
					
					// Move to previous line
					targetLine = view.state.doc.line(targetLine.number - 1);
					linesChecked++;
				}
				
				// If we still don't have a link, check if we broke early due to separator
				// In that case, look forward from the separator to find the next article link
				if (!linkMatch && linesChecked >= maxLinesToCheck) {
					return false;
				}
				
				// If we broke due to finding a separator, look forward for the link
				if (!linkMatch && (targetLine.text.includes('* * *') || targetLine.text.match(/^\*\*\d+\*\*/))) {
					// Move forward to find the article link
					let forwardLine = targetLine;
					let forwardChecks = 0;
					const maxForwardChecks = 5;
					
					while (forwardChecks < maxForwardChecks && forwardLine.number < view.state.doc.lines) {
						forwardLine = view.state.doc.line(forwardLine.number + 1);
						linkMatch = forwardLine.text.match(/\[([^\]]+)\]\(([^)]+)\)/);
						
						if (linkMatch) {
							const url = linkMatch[2];
							if (url.startsWith('http')) {
								targetLine = forwardLine;
								break;
							}
						}
						forwardChecks++;
					}
				}
				
				// If still no link found, return
				if (!linkMatch) return false;
				
				const title = linkMatch[1];
				const url = linkMatch[2];
				
				if (!url.startsWith('http')) return false;
				
				// Check if mouse is within reasonable distance of the article section
				// We allow hovering anywhere in the article section, not just on the link
				const lineDistance = Math.abs(currentLine.number - targetLine.number);
				if (lineDistance > 50) return false; // Too far from the article link
				
				// Debounce
				if ((window as any)._katsKableEditorTimeout) {
					clearTimeout((window as any)._katsKableEditorTimeout);
				}
				
				(window as any)._katsKableEditorTimeout = setTimeout(async () => {
					// Check if mouse is still in the same general area
					const currentPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
					if (currentPos === null) return;
					
					const checkLine = view.state.doc.lineAt(currentPos);
					
					// Make sure we're still in the same article section
					// (within 50 lines of the original article link)
					if (Math.abs(checkLine.number - targetLine.number) > 50) return;
					
					if (!self.sidebarView) return;
					
					const similar = await self.similarityEngine.findSimilar(
						title,
						'',
						self.settings.similarityThreshold,
						self.settings.maxSuggestions
					);
					
					// Check for repeat author in editing mode
					// Try to find the article in database to get source info
					const matchingArticle = self.database.getArticleByUrl(url);
					
					let repeatAuthorArticles: Article[] = [];
					if (matchingArticle) {
						if (matchingArticle.source && self.isIndividualWriter(matchingArticle.source)) {
							repeatAuthorArticles = self.getOtherArticlesBySource(matchingArticle.source, url);
						}
						
						self.sidebarView.populateSidebar(
							{ title, url, source: matchingArticle.source },
							similar,
							repeatAuthorArticles
						);
					} else {
						self.sidebarView.populateSidebar(
							{ title, url },
							similar,
							repeatAuthorArticles
						);
					}
				}, 300);
				
				return true;
			}
		});
	}

	async showSimilarArticlesForCurrentLine(editor: Editor, view: MarkdownView) {
		if (!this.settings.openaiApiKey) {
			new Notice('Kat\'s Kable: No OpenAI API key configured', 5000);
			return;
		}

		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		
		const article = this.parser.parseLine(line);
		if (!article) {
			new Notice('No article link found on current line', 3000);
			return;
		}
		
		new Notice(`Finding similar articles...`, 2000);
		
		const similar = await this.similarityEngine.findSimilar(
			article.title,
			article.commentary || '',
			this.settings.similarityThreshold,
			this.settings.maxSuggestions
		);
		
		// Check for repeat author - find matching article in database to get source
		let repeatAuthorArticles: Article[] = [];
		let articleSource = '';
		
		const matchingArticle = this.database.getArticleByUrl(article.url);
		
		if (matchingArticle) {
			articleSource = matchingArticle.source || '';
			if (articleSource && this.isIndividualWriter(articleSource)) {
				repeatAuthorArticles = this.getOtherArticlesBySource(articleSource, article.url);
				if (repeatAuthorArticles.length > 0) {
					new Notice(`Found ${repeatAuthorArticles.length} other articles by ${articleSource}`, 3000);
				}
			}
		}
		
		if (!this.sidebarView) {
			await this.openSidebar();
		}
		
		if (this.sidebarView) {
			this.sidebarView.populateSidebar(
				{ title: article.title, url: article.url, source: articleSource },
				similar,
				repeatAuthorArticles
			);
		}
		
		if (similar.length === 0) {
			new Notice('No similar articles found', 3000);
		}
	}
}
