import { TFile, WorkspaceLeaf } from "obsidian";
import InkPlugin from "src/main";
import "./svg-edit-button.scss";

////////
////////

export function addEditButtonToSvgView(
    plugin: InkPlugin,
    leaf: WorkspaceLeaf,
    file: TFile,
    viewType: string
) {
    // Wait for the SVG view to be rendered
    setTimeout(() => {
        const view = leaf.view;
        if (!view) return;

        // Find the view container
        const containerEl = (view as any).containerEl;
        if (!containerEl) return;

        // Check if button already exists
        if (containerEl.querySelector('.ddc_ink_svg-edit-button')) return;

        // Find the view content area - Obsidian's SVG view typically uses .view-content
        const viewContent = containerEl.querySelector('.view-content') || 
                           containerEl.querySelector('.markdown-source-view') ||
                           containerEl;
        
        // Ensure the container has relative positioning for absolute button positioning
        const computedStyle = window.getComputedStyle(viewContent);
        if (computedStyle.position === 'static') {
            (viewContent as HTMLElement).style.position = 'relative';
        }
        
        // Create the button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'ddc_ink_svg-edit-button-container';
        
        // Determine button text based on view type
        const isDrawing = viewType.includes('drawing');
        const buttonText = isDrawing ? 'Edit drawing' : 'Edit writing';
        
        // Create the edit button
        const editButton = document.createElement('button');
        editButton.className = 'ddc_ink_btn-slim ddc_ink_svg-edit-button';
        editButton.textContent = buttonText;
        editButton.title = `Edit ${isDrawing ? 'drawing' : 'writing'} in custom view`;
        
        // Handle button click
        editButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            await leaf.setViewState({
                type: viewType,
                state: { file: file.path },
                active: true,
            });
        });
        
        buttonContainer.appendChild(editButton);
        viewContent.appendChild(buttonContainer);
        
        // Clean up when the view changes
        const cleanup = () => {
            const existingButton = containerEl.querySelector('.ddc_ink_svg-edit-button-container');
            if (existingButton) {
                existingButton.remove();
            }
        };
        
        // Register cleanup on file close
        plugin.registerEvent(
            plugin.app.workspace.on('file-open', () => {
                // Clean up when a different file is opened
                const currentView = leaf.view as any;
                if (currentView?.file !== file) {
                    cleanup();
                }
            })
        );
    }, 100);
}

