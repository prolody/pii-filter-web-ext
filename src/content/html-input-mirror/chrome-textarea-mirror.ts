import { AbstractHTMLTextAreaMirror } from './abstract-textarea-mirror';
import { Rect } from '../../common/rect';

/**
 * HTML textarea mirror which supports chrome, but doesn't respect Firefox's viewport padding
 */
export class ChromeTextAreaMirror extends AbstractHTMLTextAreaMirror
{
    protected rect:         Rect =              new Rect();
    protected viewport:     Rect =              new Rect();

    constructor(
        document: Document,
        input_element: HTMLTextAreaElement,
        rect_polling_interval?: number
    ) {
        super(
            document,
            input_element,
            rect_polling_interval
        );
        this.init();
    }
    protected get_viewport(): Rect
    {
        return this.viewport
    }
    protected get_mirror_div():  HTMLDivElement
    {
        return this.div;
    }
    protected mirror_scroll(scrollLeft: number, scrollTop: number)
    {
        super.mirror_scroll(scrollLeft, scrollTop);
        // adjust for oddities (can still be a little buggy)
        // this is for textareas where spaces before a newline can extend beyond the line ending
        // i couldn't imagine they intended to do that?
        this.div.style.left =       `${ this.rect.left_absolute +   (this.div.scrollLeft - scrollLeft) }px`;
        this.div.style.top =        `${ this.rect.top_absolute +    (this.div.scrollTop - scrollTop) }px`;
    }
    protected mirror_rect(rect: Rect)
    {
        this.rect =                 rect;

        this.div.style.width =      `${ rect.width }px`;
        this.div.style.inlineSize = `${ rect.width }px`;
        this.div.style.height =     `${ rect.height }px`;
        this.div.style.blockSize =  `${ rect.height }px`;

        // adjust viewport
        this.viewport =             Rect.from_rect(rect);
        this.viewport.left +=       this.input_element.clientLeft;
        this.viewport.top +=        this.input_element.clientTop;
        this.viewport.width =       this.input_element.clientWidth;
        this.viewport.height =      this.input_element.clientHeight;

        this.mirror_scroll(this.input_element.scrollLeft, this.input_element.scrollTop);
    }
    protected mirror_style(computed_style: CSSStyleDeclaration)
    {
        super.mirror_style(computed_style);
        this.div.style.boxSizing = 'border-box';
    }
};

// how does the outer div have a resizable handle?
// range downwards clipping doesn't work.
// overlay over scroll bar needs to be clipped
// still has pointer events

// check if update on css will happen, or have polling after all