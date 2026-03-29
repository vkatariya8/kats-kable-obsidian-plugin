import { App, PluginSettingTab, Setting } from 'obsidian';

// We need to reference the plugin type without circular dependency
type KatsKablePluginType = {
	settings: {
		similarityThreshold: number;
		maxSuggestions: number;
		openaiApiKey: string;
	};
	database: {
		isLoaded(): boolean;
		getAllArticles(): any[];
	};
	saveSettings(): Promise<void>;
};

export class KatsKableSettingTab extends PluginSettingTab {
	plugin: KatsKablePluginType;

	constructor(app: App, plugin: KatsKablePluginType) {
		super(app, plugin as any);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Kat\'s Kable Archive Intelligence Settings' });

		// Similarity Threshold Setting
		new Setting(containerEl)
			.setName('Similarity Threshold')
			.setDesc('Minimum cosine similarity score (0.0 - 1.0). Lower values show more suggestions but may be less relevant. Default: 0.4')
			.addSlider(slider => {
				slider
					.setLimits(0.1, 0.9, 0.05)
					.setValue(this.plugin.settings.similarityThreshold)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.similarityThreshold = value;
						await this.plugin.saveSettings();
					});
			});

		// Max Suggestions Setting
		new Setting(containerEl)
			.setName('Max Suggestions')
			.setDesc('Maximum number of similar articles to show. Default: 3')
			.addDropdown(dropdown => {
				dropdown
					.addOption('1', '1 article')
					.addOption('3', '3 articles')
					.addOption('5', '5 articles')
					.addOption('10', '10 articles')
					.setValue(String(this.plugin.settings.maxSuggestions))
					.onChange(async (value) => {
						this.plugin.settings.maxSuggestions = parseInt(value);
						await this.plugin.saveSettings();
					});
			});

		// OpenAI API Key Setting
		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('Your OpenAI API key for generating embeddings. If left empty, the plugin will try to load from the .env file in the plugin folder.')
			.addText(text => {
				text
					.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.openaiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openaiApiKey = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
			});

		// Info section
		containerEl.createEl('h3', { text: 'About' });
		const infoDiv = containerEl.createDiv();
		infoDiv.innerHTML = `
			<p><strong>Database Status:</strong> ${this.plugin.database.isLoaded() ? '✅ Loaded' : '❌ Not Loaded'}</p>
			${this.plugin.database.isLoaded() ? `<p><strong>Articles in Archive:</strong> ${this.plugin.database.getAllArticles().length}</p>` : ''}
			<p><strong>Plugin Version:</strong> 1.0.0</p>
			<p style="margin-top: 20px; color: var(--text-muted);">
				Tip: Lower similarity thresholds (0.3-0.4) show more suggestions but may include less relevant matches. 
				Higher thresholds (0.7-0.8) show only very similar articles.
			</p>
		`;
	}
}
