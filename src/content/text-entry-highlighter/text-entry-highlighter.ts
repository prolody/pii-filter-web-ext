// Text highlighting utilities for textarea, input, and contenteditable elements
// Copyright (C) 2021 habanerocake

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.


import { Bindings } from './bindings';
import { HighlightTextAreaSource } from './text-entry-sources/text-area';
import { HighlightContentParser, Highlighter, HighlightTextEntrySource } from './highlighter';
import { HighlightInputSource } from './text-entry-sources/input';
import { HighlightContentEditableSource } from './text-entry-sources/contenteditable';

export class TextEntryHighlighter
{
    protected bindings: Bindings = new Bindings();
    protected source:   HighlightTextEntrySource;
    protected root_div: HTMLDivElement;
    protected shadow:   ShadowRoot;

    constructor(
        protected document: Document,
        protected highlighter: Highlighter,
        protected content_parser: HighlightContentParser
    )
    {
        // bind highlighter and content parser
        this.content_parser.set_highlighter(highlighter);
        this.highlighter.set_content_parser(this.content_parser);
        
        if (document.body.lastElementChild == null)
            return;

        // create shadow
        this.root_div = this.document.createElement("div");
        this.shadow =  this.root_div.attachShadow({mode: 'open'});
        document.body.lastElementChild.insertAdjacentElement('afterend', this.root_div);

        // catch focus
        this.bindings.bind_event(document, 'focusin', (event: Event) => {
            const target_element: HTMLElement = event.target as HTMLElement;

            // delete old interface
            if (this.source != null)
                this.source.remove();

            const polling_interval: number = 1500;

            const add_interface = (event: Event) => {
                target_element.removeEventListener('mouseup', add_interface);
                target_element.removeEventListener('keyup', add_interface);

                if (target_element.nodeName == 'INPUT')
                    this.source = new HighlightInputSource(target_element, polling_interval);
                else if (target_element.nodeName == 'TEXTAREA')
                    this.source = new HighlightTextAreaSource(target_element, polling_interval);
                else if (target_element.isContentEditable)
                    this.source = new HighlightContentEditableSource(target_element, polling_interval);
                else
                    return;

                // bind interface removal
                for (let event_name of ['blur', 'focusout'])
                {
                    const on_blur = (event: Event) => {
                        this.remove_source();
                        target_element.removeEventListener(event_name, on_blur);
                    };
                    target_element.addEventListener(event_name, on_blur);
                }

                // initialize
                this.source.init(
                    this.document,
                    this.shadow,
                    this.highlighter
                );
                // console.log('bound');
            };
            target_element.addEventListener('mouseup', add_interface);
            target_element.addEventListener('keyup', add_interface);
        });
    }

    public remove_source()
    {
        if (this.source != null)
        {
            this.source.remove();
            this.source = null;
            // console.log('released');
        }
    }

    public remove()
    {
        this.bindings.remove();
    }
};