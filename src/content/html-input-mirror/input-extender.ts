import { ShadowDomDiv } from '../shadow-dom';
import { Bindings } from '../bindings';
import { ElementObserver } from './element_observer';
import { Rect } from '../../common/rect';
import { DOMRectHighlight } from '../dom-rect-highlight';

// currently only works for 1 input at a time

export interface InputInterfaceSettings
{
    document:           Document;
    element:            HTMLElement;
    polling_interval:   number;
    on_blur?:           (event: Event) => void;
    on_input_changed?:  (value: string) => void;
};

export abstract class AbstractInputInterface extends ShadowDomDiv
{
    protected bindings:         Bindings = new Bindings();
    protected element_observer: ElementObserver;
    // add range display stuff here as well

    constructor(protected settings: InputInterfaceSettings)
    {
        super(settings.document);
        this.div.style.position = 'absolute';
    }

    protected init()
    {
        this.element_observer = new ElementObserver(
            document,
            this.settings.element,
            this.settings.polling_interval,
            (rect: Rect, style: CSSStyleDeclaration) => { this.on_rect_changed(rect, style); },
            (changes: Map<string, string>, all: Map<string, string>) => { this.on_style_changed(changes, all); },
        );
    }

    public delete()
    {
        this.bindings.delete();
        this.element_observer.delete();
        super.delete();
    }

    public abstract on_rect_changed(rect: Rect, style: CSSStyleDeclaration): void;
    public abstract on_style_changed(changes: Map<string, string>, all: Map<string, string>): void;
    public abstract contains(element: HTMLElement): boolean;
};

export function copy_event(event: Event, new_target?: HTMLElement): Event
{
    let event_dict: object = {};
    for (let key in event)
        Reflect.set(event_dict, key, Reflect.get(event, key));
    if (new_target != null && Reflect.has(event, 'target'))
        Reflect.set(event_dict, 'target', new_target);
    return new Event(event.type, event_dict);
}

interface LineMapping
{
    caret_range:    [number, number];
    height?:        number;
};

export class TextAreaOverlay extends AbstractInputInterface
{
    protected input_overlay:            HTMLElement;
    protected computed_style:           CSSStyleDeclaration;
    protected viewport:                 Rect = new Rect();

    protected t_highlight:              DOMRectHighlight;
    constructor(settings: InputInterfaceSettings)
    {
        super(settings);
        
        this.input_overlay = settings.document.createElement('div');
        this.computed_style = window.getComputedStyle(this.settings.element);
        this.div.appendChild(this.input_overlay);

        const text_area_element: HTMLTextAreaElement = (this.settings.element as HTMLTextAreaElement);

        // watch outside changes
        const element_input_callback = (event: Event) => {
            const new_text: string = text_area_element.value;
            if (this.settings.on_input_changed != null)
                this.settings.on_input_changed(new_text);

            this.probe_line_mapping();
        };

        for (let event_name of ['focus', 'focusin'])
            this.bindings.bind_event(this.input_overlay, event_name, (event: Event) => {
                // forward_event(event);
                event.preventDefault();
                event.stopPropagation();
                // sync_contents();
            });

        // bind check if form or event changes textarea contents
        for (let event_name of ['input', 'change'])
            this.bindings.bind_event(this.settings.element, event_name, element_input_callback);

        // keep at end
        super.init();

        // this.input_overlay.scrollTop =  this.settings.element.scrollTop;
        // this.input_overlay.scrollLeft = this.settings.element.scrollLeft;

        // element bindings
        this.bindings.bind_event(this.settings.element, 'mousedown', () => {
            const m_event: MouseEvent = event as MouseEvent;
            let caret_index: number = 0;
            if (typeof document.caretPositionFromPoint != "undefined") {
                let caret_pos: CaretPosition = document.caretPositionFromPoint(m_event.pageX, m_event.pageY);
                caret_index = caret_pos.offset;
            } else if (typeof document.caretRangeFromPoint != "undefined") {
                let caret_range: Range = document.caretRangeFromPoint(m_event.pageX, m_event.pageY);
                caret_index = 0;
                console.log(caret_range.toString());
            }
            console.log(caret_index);
        });
        for (let event_name of ['blur', 'focusout'])
            this.bindings.bind_event(this.settings.element, event_name, (event: Event) => {
                let f_event: FocusEvent = event as FocusEvent;
                if (f_event.relatedTarget != this.input_overlay)
                {
                    if (this.settings.on_blur != null)
                        this.settings.on_blur(event);
                }
            });
    };

    protected probe_line_mapping()
    {
        const caret_index_from_point = (x: number, y: number): number =>
        {
            // todo, maybe this is different for chrome and ff?
            x -= window.scrollX;
            y -= window.scrollY;

            let caret_index: number;
            if (typeof document.caretPositionFromPoint != "undefined") {
                let caret_pos: CaretPosition = document.caretPositionFromPoint(x, y);
                if (caret_pos != null)
                    caret_index = caret_pos.offset;
            } else if (typeof document.caretRangeFromPoint != "undefined") {
                let caret_range: Range = document.caretRangeFromPoint(x, y);
                if (caret_range != null)
                    caret_index = caret_range.endOffset;
            }
            return caret_index;
        };
        const max_len:  number =     (this.settings.element as HTMLTextAreaElement).value.length;
        let lines:      Array<LineMapping> = new Array<LineMapping>();
        const caret_index_valid =   (index: number): boolean => {
            if (index != null)
                return (index != 0 || lines.length == 0) && index != max_len;
            return false;
        };

        let last_mapping:       LineMapping;
        let last_mapping_left:  number;
        let last_line_start_y:  number = 0;
        let y:                  number = parseFloat(this.computed_style.paddingTop);
        let increment:          number = 2;
        // move down and get a valid set
        for (y; y < this.viewport.height; y += increment)
        {
            let new_start_caret: boolean = false;
            if (last_mapping != null)
            {
                const t_caret = caret_index_from_point(
                    this.viewport.left_absolute + last_mapping_left,
                    this.viewport.top_absolute + y
                );
                // console.log(t_caret, last_mapping.caret_range[0]);
                
                new_start_caret = caret_index_valid(t_caret) && t_caret != last_mapping.caret_range[0];
            }

            let start_caret_pos: number;
            if (last_mapping == null || new_start_caret)
            {
                if (last_mapping_left == null)
                {
                    for (let x: number = 0; x < this.viewport.width; x += 3)
                    {
                        const t_caret = caret_index_from_point(
                            this.viewport.left_absolute + x,
                            this.viewport.top_absolute + y
                        );
                        
                        if (caret_index_valid(t_caret))
                        {
                            start_caret_pos =   t_caret;
                            last_mapping_left = x;
                            break;
                        }
                    }
                }
                else
                {
                    const t_caret = caret_index_from_point(
                        this.viewport.left_absolute + last_mapping_left,
                        this.viewport.top_absolute + y
                    );
                    if (caret_index_valid(t_caret))
                        start_caret_pos =   t_caret;
                }
                if (start_caret_pos != null)
                {
                    const height:   number = y - last_line_start_y;
                    const mapping:  LineMapping = {
                        caret_range: [
                            start_caret_pos,
                            start_caret_pos
                        ],
                        height: height
                    };
                    lines.push(mapping);

                    if (lines.length == 2)
                    {
                        increment = parseFloat(this.computed_style.fontSize) / 2;
                    }

                    last_mapping =      mapping;
                    last_line_start_y = y;
                }
            }
        }
        
        // TODO: very last word end pos also needs to be checked

        let last_line: number;
        for (let line of lines)
        {
            if (last_line != null)
            {
                console.log(
                    [last_line, line.caret_range[0]],
                    (this.settings.element as HTMLTextAreaElement).value.substring(last_line, line.caret_range[0])
                )
            }
            last_line = line.caret_range[0];
        }
    }

    public delete()
    {
        if (this.t_highlight != null)
            this.t_highlight.delete();

        super.delete();
    }

    public on_rect_changed(rect: Rect, style: CSSStyleDeclaration)
    {
        rect.apply_position_to_element(this.div, true);
        rect.apply_width_and_height_to_element(this.input_overlay);

        this.viewport =         Rect.from_rect(rect);
        this.viewport.left +=   this.settings.element.clientLeft;
        this.viewport.top +=    this.settings.element.clientTop;
        this.viewport.width =   this.settings.element.clientWidth;
        this.viewport.height =  this.settings.element.clientHeight;

        if (this.t_highlight != null)
            this.t_highlight.delete();

        this.t_highlight = new DOMRectHighlight(document, this.viewport, 2);
        this.t_highlight.color = [0, 255, 0, 1.0];
    }

    public on_style_changed(changes: Map<string, string>, all: Map<string, string>)
    {
        for (let [key, value] of changes)
        {
            if ([ // ignore following
                'margin',
                'margin-top',
                'margin-bottom',
                'margin-left',
                'margin-right',
                'margin-block-start',
                'margin-block-end',
                'margin-inline-start',
                'margin-inline-end',
                'user-modify',
                '-webkit-user-modify',
                'visibility',
                'perspective-origin',
                'transform-origin'
            ].indexOf(key) == -1)
                Reflect.set(this.input_overlay.style, key, value);
            // console.log(key, value);
        }
        
        // overrides
        this.input_overlay.style.position =     'relative';
        this.input_overlay.style.boxSizing =    'border-box';
        this.input_overlay.style.display =      'block';
        this.input_overlay.style.margin =       '0px';
        this.input_overlay.style.zIndex =       '99999';
        this.input_overlay.style.transition =   'none';
        this.input_overlay.style.animation =    'none';

        // set defaults
        for (let key of ['overflow-x', 'overflow-y'])
            if (!all.has(key))
                this.input_overlay.style.setProperty(key, 'auto');
        if (!all.has('white-space'))
            this.input_overlay.style.whiteSpace =   'pre-wrap';
        if (!all.has('word-wrap'))
            this.input_overlay.style.wordWrap =     'break-word';
        if (!all.has('resize'))
            this.input_overlay.style.resize =       'both';
        if (!all.has('line-height'))
            this.input_overlay.style.lineHeight =   'normal';
        
        this.input_overlay.style.cssText +=         'appearance: textarea;';
        this.input_overlay.style.outline =          '2px solid green';
        this.input_overlay.style.pointerEvents =    'none';
        this.div.style.pointerEvents =              'none';
    }
    
    public contains(element: HTMLElement): boolean
    {
        return (element == this.input_overlay);
    }
};

export class PIIFilterInputExtender
{
    protected bindings:         Bindings =                  new Bindings();
    protected input_interface:  AbstractInputInterface;

    constructor(main_document: Document)
    {
        // catch focus
        this.bindings.bind_event(document, 'focusin', (event: Event) => {
            const target_element: HTMLElement = event.target as HTMLElement;

            // TODO: keep old interface if it is of same type

            const on_blur = (event: Event) =>
            {
                // todo other stuff (check if this is because of other overlay)
                this.delete_interface();
            };

            // delete old interface
            if (this.input_interface != null)
                this.input_interface.delete();

            const settings: InputInterfaceSettings = {
                document:           document,
                element:            target_element,
                polling_interval:   5000,
                on_blur:            on_blur
            };

            const add_interface = (event: Event) => {
                target_element.removeEventListener('mouseup', add_interface);
                target_element.removeEventListener('keyup', add_interface);

                // ignore if target is part of input interface
                if (this.input_interface != null && this.input_interface.contains(target_element))
                    return;

                if (target_element.nodeName == 'INPUT')
                    return // TODO
                else if (target_element.nodeName == 'TEXTAREA')
                    this.input_interface = new TextAreaOverlay(settings);
                else if (target_element.isContentEditable)
                    return
                else
                    return;
                
                console.log('bound');
            };
            target_element.addEventListener('mouseup', add_interface);
            target_element.addEventListener('keyup', add_interface);
        });


        // catch input / clicking / polling
    }

    public delete_interface()
    {
        if (this.input_interface != null)
        {
            console.log('released');
            this.input_interface.delete();
            this.input_interface = null;
        }
    }

    public delete()
    {
        this.bindings.delete();
    }
};

// TODO:
// sync range highlighting
// regexp -> function, parse each element -> index -> ranges? or list of ranges -> regexp, highlighting?

// input 1 line same functionality

// TODO: eventually:
// poll for uncaught css changes
// redo firefox support so that ctr/cmd keycomb work. or try different approach
// have scroll work other way around if not triggered by own el.