// Add after imports
import { StreamInput } from './input.js';

// ── Touch Controller Configuration ──────────────────────────────────
interface TouchControllerConfig {
    /** Opacity of the controller overlay (0-1) */
    opacity?: number;
    /** Scale factor for controller size */
    scale?: number;
    /** Whether to show visual feedback on button press */
    showFeedback?: boolean;
    /** Reference to StreamInput for sending controller data */
    streamInput?: StreamInput | null;
}

// ── Virtual Controller State ────────────────────────────────────────
interface VirtualControllerState {
    // Button states (bit flags)
    buttons: Set<number>;
    
    // Stick values (-1 to 1, normalized)
    leftStickX: number;
    leftStickY: number;
    rightStickX: number;
    rightStickY: number;
}

// ── Touch Region Definition ─────────────────────────────────────────
interface TouchRegion {
    x: number;      // Normalized position (0-1)
    y: number;
    width: number;  // Normalized size
    height: number;
    type: 'stick' | 'button' | 'dpad';
    id?: string;
    buttonFlag?: number;
}

// ── Touch Controller Class ──────────────────────────────────────────
export class TouchController {
    private container: HTMLElement;
    private config: Required<TouchControllerConfig>;
    private state: VirtualControllerState;
    private isVisible: boolean = false;
    
    // Touch tracking
    private touches: Map<number, {
        region: TouchRegion;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        isDragging: boolean;
    }> = new Map();
    
    // Dead zones for sticks (to prevent drift)
    private readonly STICK_DEADZONE = 0.15;
    private readonly STICK_MAX_RADIUS = 40; // pixels
    
    // D-pad configuration
    private readonly DPAD_SIZE = 32; // pixels
    private dpadActive: 'up' | 'down' | 'left' | 'right' | null = null;
    
    // Stream input reference for sending controller data
    private streamInput: StreamInput | null = null;
    
    constructor(config?: TouchControllerConfig) {
        this.config = {
            opacity: config?.opacity ?? 0.4,
            scale: config?.scale ?? 1.0,
            showFeedback: config?.showFeedback ?? true,
            streamInput: config?.streamInput ?? null,
        };
        
        this.state = {
            buttons: new Set(),
            leftStickX: 0,
            leftStickY: 0,
            rightStickX: 0,
            rightStickY: 0,
        };
        
        this.container = this.createControllerDOM();
    }
    
    // ── DOM Creation ────────────────────────────────────────────────
    private createControllerDOM(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'touch-controller';
        container.className = 'touch-controller';
        container.style.opacity = String(this.config.opacity);
        
        // Left stick area
        const leftStick = this.createStickArea('left-stick', 'left');
        container.appendChild(leftStick);
        
        // D-pad (below left stick)
        const dpad = this.createDPAD();
        container.appendChild(dpad);
        
        // Right stick area
        const rightStick = this.createStickArea('right-stick', 'right');
        container.appendChild(rightStick);
        
        // Action buttons (PlayStation layout: Triangle, Circle, X, Square)
        const actionButtons = this.createActionButtons();
        container.appendChild(actionButtons);
        
        // Shoulder buttons (L1/R1)
        const shoulderButtons = this.createShoulderButtons();
        container.appendChild(shoulderButtons);
        
        // Start/Select buttons
        const metaButtons = this.createMetaButtons();
        container.appendChild(metaButtons);
        
        return container;
    }
    
    private createStickArea(id: string, side: 'left' | 'right'): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = `stick-wrapper ${side}`;
        
        const stick = document.createElement('div');
        stick.id = id;
        stick.className = 'virtual-stick';
        
        // Inner knob that moves
        const knob = document.createElement('div');
        knob.className = 'stick-knob';
        stick.appendChild(knob);
        
        wrapper.appendChild(stick);
        return wrapper;
    }
    
    private createDPAD(): HTMLElement {
        const dpadContainer = document.createElement('div');
        dpadContainer.id = 'dpad-container';
        dpadContainer.className = 'dpad';
        
        // Create 5 buttons (up, down, left, right, center)
        const directions: Array<{ dir: string, flag: number, label: string }> = [
            { dir: 'up', flag: BUTTON_MAP.UP, label: '▲' },
            { dir: 'down', flag: BUTTON_MAP.DOWN, label: '▼' },
            { dir: 'left', flag: BUTTON_MAP.LEFT, label: '◀' },
            { dir: 'right', flag: BUTTON_MAP.RIGHT, label: '▶' },
        ];
        
        directions.forEach(({ dir, flag }) => {
            const btn = document.createElement('div');
            btn.className = `dpad-btn dpad-${dir}`;
            btn.dataset.flag = String(flag);
            btn.textContent = label;
            
            // Touch events for D-pad
            btn.addEventListener('touchstart', (e) => this.handleDPADStart(e, dir, flag), { passive: false });
            btn.addEventListener('touchend', () => this.handleDPADEnd(), { passive: false });
            btn.addEventListener('touchcancel', () => this.handleDPADEnd(), { passive: false });
            
            dpadContainer.appendChild(btn);
        });
        
        return dpadContainer;
    }
    
    private createActionButtons(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'action-buttons';
        container.className = 'action-buttons';
        
        // PlayStation layout: Triangle, Circle, X, Square in diamond formation
        const buttons: Array<{ id: string, flag: number, label: string, color: string }> = [
            { id: 'triangle', flag: BUTTON_MAP.TRIANGLE, label: '△', color: '#4CAF50' },
            { id: 'circle', flag: BUTTON_MAP.CIRCLE, label: '○', color: '#F44336' },
            { id: 'cross', flag: BUTTON_MAP.CROSS, label: '✕', color: '#2196F3' },
            { id: 'square', flag: BUTTON_MAP.SQUARE, label: '□', color: '#E91E63' },
        ];
        
        buttons.forEach(({ id, flag, label, color }) => {
            const btn = document.createElement('div');
            btn.id = `btn-${id}`;
            btn.className = 'action-btn';
            btn.dataset.flag = String(flag);
            btn.style.backgroundColor = color;
            
            // Add symbol overlay
            const symbol = document.createElement('span');
            symbol.textContent = label;
            symbol.style.color = 'white';
            symbol.style.fontSize = '24px';
            symbol.style.fontWeight = 'bold';
            btn.appendChild(symbol);
            
            // Touch events
            btn.addEventListener('touchstart', (e) => this.handleButtonStart(e, flag), { passive: false });
            btn.addEventListener('touchend', () => this.handleButtonEnd(flag), { passive: false });
            btn.addEventListener('touchcancel', () => this.handleButtonEnd(flag), { passive: false });
            
            container.appendChild(btn);
        });
        
        return container;
    }
    
    private createShoulderButtons(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'shoulder-buttons';
        container.className = 'shoulder-buttons';
        
        // L1 button
        const l1 = this.createShoulderButton('L1', BUTTON_MAP.L1, 'left');
        container.appendChild(l1);
        
        // R1 button
        const r1 = this.createShoulderButton('R1', BUTTON_MAP.R1, 'right');
        container.appendChild(r1);
        
        return container;
    }
    
    private createShoulderButton(id: string, flag: number, side: string): HTMLElement {
        const btn = document.createElement('div');
        btn.id = `btn-${id.toLowerCase()}`;
        btn.className = 'shoulder-btn';
        btn.dataset.flag = String(flag);
        
        const label = document.createElement('span');
        label.textContent = id;
        label.style.color = 'white';
        label.style.fontWeight = 'bold';
        btn.appendChild(label);
        
        // Position based on side
        btn.style.left = side === 'left' ? '10%' : 'auto';
        btn.style.right = side === 'right' ? '10%' : 'auto';
        
        // Touch events
        btn.addEventListener('touchstart', (e) => this.handleButtonStart(e, flag), { passive: false });
        btn.addEventListener('touchend', () => this.handleButtonEnd(flag), { passive: false });
        btn.addEventListener('touchcancel', () => this.handleButtonEnd(flag), { passive: false });
        
        return btn;
    }
    
    private createMetaButtons(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'meta-buttons';
        container.className = 'meta-buttons';
        
        // Select button (Back)
        const select = this.createMetaButton('Select', BUTTON_MAP.SELECT);
        container.appendChild(select);
        
        // Start button (Play)
        const start = this.createMetaButton('Start', BUTTON_MAP.START);
        container.appendChild(start);
        
        return container;
    }
    
    private createMetaButton(label: string, flag: number): HTMLElement {
        const btn = document.createElement('div');
        btn.className = 'meta-btn';
        btn.dataset.flag = String(flag);
        btn.textContent = label;
        
        // Touch events
        btn.addEventListener('touchstart', (e) => this.handleButtonStart(e, flag), { passive: false });
        btn.addEventListener('touchend', () => this.handleButtonEnd(flag), { passive: false });
        btn.addEventListener('touchcancel', () => this.handleButtonEnd(flag), { passive: false });
        
        return btn;
    }
    
    // ── Touch Event Handlers ────────────────────────────────────────
    private handleButtonStart(event: TouchEvent, flag: number) {
        event.preventDefault();
        event.stopPropagation();
        
        this.state.buttons.add(flag);
        if (this.config.showFeedback) {
            this.flashButton(flag, true);
        }
    }
    
    private handleButtonEnd(flag: number) {
        this.state.buttons.delete(flag);
        if (this.config.showFeedback) {
            this.flashButton(flag, false);
        }
    }
    
    private flashButton(flag: number, pressed: boolean) {
        // Find the button element with this flag and add/remove active class
        const buttons = document.querySelectorAll(`[data-flag="${flag}"]`);
        buttons.forEach(btn => {
            if (pressed) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    private handleDPADStart(event: TouchEvent, direction: string, flag: number) {
        event.preventDefault();
        event.stopPropagation();
        
        this.dpadActive = direction as any;
        this.state.buttons.add(flag);
    }
    
    private handleDPADEnd() {
        if (this.dpadActive) {
            const flag = BUTTON_MAP[this.dpadActive.toUpperCase() as keyof typeof BUTTON_MAP];
            this.state.buttons.delete(flag);
            this.dpadActive = null;
        }
    }
    
    // ── State Conversion ────────────────────────────────────────────
    /**
     * Converts virtual controller state to GamepadState for sending to stream.
     */
    getGamepadState(): GamepadState {
        let buttonFlags = 0;
        
        // Convert button set to flags
        this.state.buttons.forEach(flag => {
            buttonFlags |= flag;
        });
        
        return {
            buttonFlags,
            leftTrigger: 0,
            rightTrigger: 0,
            leftStickX: this.state.leftStickX,
            leftStickY: this.state.leftStickY,
            rightStickX: this.state.rightStickX,
            rightStickY: this.state.rightStickY,
        };
    }
    
    // ── Visibility Control ──────────────────────────────────────────
    show() {
        this.isVisible = true;
        this.container.style.display = 'flex';
    }
    
    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
        
        // Reset state when hidden
        this.resetState();
    }
    
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
    
    isVisible(): boolean {
        return this.isVisible;
    }
    
    // ── Container Access ────────────────────────────────────────────
    getContainer(): HTMLElement {
        return this.container;
    }
    
    // ── Cleanup ─────────────────────────────────────────────────────
    private resetState() {
        this.state.buttons.clear();
        this.state.leftStickX = 0;
        this.state.leftStickY = 0;
        this.state.rightStickX = 0;
        this.state.rightStickY = 0;
        this.touches.clear();
    }
    
    destroy() {
        this.resetState();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
