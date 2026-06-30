/**
 * Virtual Touch Controller for Moonlight Web Client
 */

import { GamepadState } from './gamepad.js';

// ── Button Flags Mapping (PlayStation Layout) ────────────────────────
const BUTTON_MAP = {
    TRIANGLE: 0x1,
    CIRCLE: 0x2,
    CROSS: 0x4,
    SQUARE: 0x8,
    L1: 0x10,
    R1: 0x20,
    L3: 0x40,
    R3: 0x80,
    SELECT: 0x100,
    START: 0x200,
    UP: 0x400,
    DOWN: 0x800,
    LEFT: 0x1000,
    RIGHT: 0x2000,
} as const;

interface TouchControllerConfig {
    opacity?: number;
    scale?: number;
    showFeedback?: boolean;
}

interface VirtualControllerState {
    buttons: Set<number>;
    leftStickX: number;
    leftStickY: number;
    rightStickX: number;
    rightStickY: number;
    leftTrigger: number;
    rightTrigger: number;
}

interface TouchRegion {
    id: string;
    type: 'stick';
}

export class TouchController {
    private container: HTMLElement;
    private config: Required<TouchControllerConfig>;
    private state: VirtualControllerState;
    private isVisibleFlag: boolean = false;
    
    private touches: Map<number, {
        region: TouchRegion;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        isDragging: boolean;
    }> = new Map();
    
    private readonly STICK_DEADZONE = 0.15;
    private readonly STICK_MAX_RADIUS = 40;
    
    private dpadActive: string | null = null;
    
    constructor(config?: TouchControllerConfig) {
        this.config = {
            opacity: config?.opacity ?? 0.4,
            scale: config?.scale ?? 1.0,
            showFeedback: config?.showFeedback ?? true,
        };
        
        this.state = {
            buttons: new Set(),
            leftStickX: 0,
            leftStickY: 0,
            rightStickX: 0,
            rightStickY: 0,
            leftTrigger: 0,
            rightTrigger: 0,
        };
        
        this.container = this.createControllerDOM();
    }
    
    private createControllerDOM(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'touch-controller';
        container.className = 'touch-controller';
        container.style.opacity = String(this.config.opacity);
        
        container.appendChild(this.createStickArea('left-stick', 'left'));
        container.appendChild(this.createDPAD());
        container.appendChild(this.createStickArea('right-stick', 'right'));
        container.appendChild(this.createActionButtons());
        container.appendChild(this.createShoulderButtons());
        container.appendChild(this.createMetaButtons());
        
        return container;
    }
    
    private createStickArea(id: string, side: 'left' | 'right'): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = `stick-wrapper ${side}`;
        
        const stick = document.createElement('div');
        stick.id = id;
        stick.className = 'virtual-stick';
        
        const knob = document.createElement('div');
        knob.className = 'stick-knob';
        stick.appendChild(knob);
        wrapper.appendChild(stick);
        
        stick.addEventListener('touchstart', (e) => this.handleStickStart(e, side), { passive: false });
        stick.addEventListener('touchmove', (e) => this.handleStickMove(e, side, knob), { passive: false });
        stick.addEventListener('touchend', (e) => this.handleStickEnd(e, side, knob), { passive: false });
        stick.addEventListener('touchcancel', (e) => this.handleStickEnd(e, side, knob), { passive: false });
        
        return wrapper;
    }
    
    private createDPAD(): HTMLElement {
        const dpadContainer = document.createElement('div');
        dpadContainer.id = 'dpad-container';
        dpadContainer.className = 'dpad';
        
        const directions = [
            { dir: 'up', flag: BUTTON_MAP.UP, label: '▲' },
            { dir: 'down', flag: BUTTON_MAP.DOWN, label: '▼' },
            { dir: 'left', flag: BUTTON_MAP.LEFT, label: '◀' },
            { dir: 'right', flag: BUTTON_MAP.RIGHT, label: '▶' },
        ];
        
        directions.forEach(({ dir, flag, label }) => {
            const btn = document.createElement('div');
            btn.className = `dpad-btn dpad-${dir}`;
            btn.dataset.flag = String(flag);
            btn.textContent = label;
            
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
        
        const buttons = [
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
            
            const symbol = document.createElement('span');
            symbol.textContent = label;
            symbol.style.color = 'white';
            symbol.style.fontSize = '24px';
            symbol.style.fontWeight = 'bold';
            btn.appendChild(symbol);
            
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
        
        container.appendChild(this.createShoulderButton('L1', BUTTON_MAP.L1, 'left', 'top'));
        container.appendChild(this.createTriggerButton('L2', 'left', 'bottom'));
        container.appendChild(this.createShoulderButton('R1', BUTTON_MAP.R1, 'right', 'top'));
        container.appendChild(this.createTriggerButton('R2', 'right', 'bottom'));
        
        return container;
    }
    
    private createShoulderButton(id: string, flag: number, side: string, vPosition: string): HTMLElement {
        const btn = document.createElement('div');
        btn.id = `btn-${id.toLowerCase()}`;
        btn.className = `shoulder-btn ${side} ${vPosition}`;
        btn.dataset.flag = String(flag);
        
        const label = document.createElement('span');
        label.textContent = id;
        btn.appendChild(label);
        
        btn.addEventListener('touchstart', (e) => this.handleButtonStart(e, flag), { passive: false });
        btn.addEventListener('touchend', () => this.handleButtonEnd(flag), { passive: false });
        btn.addEventListener('touchcancel', () => this.handleButtonEnd(flag), { passive: false });
        
        return btn;
    }

    private createTriggerButton(id: string, side: string, vPosition: string): HTMLElement {
        const btn = document.createElement('div');
        btn.id = `btn-${id.toLowerCase()}`;
        btn.className = `shoulder-btn trigger-btn ${side} ${vPosition}`;
        
        const label = document.createElement('span');
        label.textContent = id;
        btn.appendChild(label);
        
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault(); e.stopPropagation();
            if(side === 'left') this.state.leftTrigger = 1.0;
            if(side === 'right') this.state.rightTrigger = 1.0;
            if (this.config.showFeedback) btn.classList.add('active');
        }, { passive: false });

        btn.addEventListener('touchend', () => {
             if(side === 'left') this.state.leftTrigger = 0.0;
             if(side === 'right') this.state.rightTrigger = 0.0;
             btn.classList.remove('active');
        }, { passive: false });
        
        return btn;
    }
    
    private createMetaButtons(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'meta-buttons';
        container.className = 'meta-buttons';
        
        container.appendChild(this.createMetaButton('Select', BUTTON_MAP.SELECT));
        container.appendChild(this.createMetaButton('Start', BUTTON_MAP.START));
        return container;
    }
    
    private createMetaButton(label: string, flag: number): HTMLElement {
        const btn = document.createElement('div');
        btn.className = 'meta-btn';
        btn.dataset.flag = String(flag);
        btn.textContent = label;
        
        btn.addEventListener('touchstart', (e) => this.handleButtonStart(e, flag), { passive: false });
        btn.addEventListener('touchend', () => this.handleButtonEnd(flag), { passive: false });
        btn.addEventListener('touchcancel', () => this.handleButtonEnd(flag), { passive: false });
        
        return btn;
    }
    
    // ── Touch Event Handlers ────────────────────────────────────────

    private handleStickStart(event: TouchEvent, side: 'left' | 'right') {
        event.preventDefault();
        event.stopPropagation();
        
        const touch = event.changedTouches[0];
        this.touches.set(touch.identifier, {
            region: { id: side, type: 'stick' },
            startX: touch.clientX,
            startY: touch.clientY,
            currentX: touch.clientX,
            currentY: touch.clientY,
            isDragging: true
        });
    }

    private handleStickMove(event: TouchEvent, side: 'left' | 'right', knobEl: HTMLElement) {
        event.preventDefault();
        event.stopPropagation();

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            const touchData = this.touches.get(touch.identifier);

            if (touchData && touchData.region.id === side && touchData.isDragging) {
                touchData.currentX = touch.clientX;
                touchData.currentY = touch.clientY;

                let dx = touchData.currentX - touchData.startX;
                let dy = touchData.currentY - touchData.startY;

                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > this.STICK_MAX_RADIUS) {
                    const ratio = this.STICK_MAX_RADIUS / distance;
                    dx *= ratio;
                    dy *= ratio;
                }

                knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

                let normX = dx / this.STICK_MAX_RADIUS;
                let normY = dy / this.STICK_MAX_RADIUS;

                if (Math.abs(normX) < this.STICK_DEADZONE) normX = 0;
                if (Math.abs(normY) < this.STICK_DEADZONE) normY = 0;

                if (side === 'left') {
                    this.state.leftStickX = normX;
                    this.state.leftStickY = -normY; 
                } else {
                    this.state.rightStickX = normX;
                    this.state.rightStickY = -normY;
                }
            }
        }
    }

    private handleStickEnd(event: TouchEvent, side: 'left' | 'right', knobEl: HTMLElement) {
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            const touchData = this.touches.get(touch.identifier);

            if (touchData && touchData.region.id === side) {
                this.touches.delete(touch.identifier);
                knobEl.style.transform = `translate(-50%, -50%)`;
                
                if (side === 'left') {
                    this.state.leftStickX = 0;
                    this.state.leftStickY = 0;
                } else {
                    this.state.rightStickX = 0;
                    this.state.rightStickY = 0;
                }
            }
        }
    }

    private handleButtonStart(event: TouchEvent, flag: number) {
        event.preventDefault();
        event.stopPropagation();
        this.state.buttons.add(flag);
        if (this.config.showFeedback) this.flashButton(flag, true);
    }
    
    private handleButtonEnd(flag: number) {
        this.state.buttons.delete(flag);
        if (this.config.showFeedback) this.flashButton(flag, false);
    }
    
    private flashButton(flag: number, pressed: boolean) {
        const buttons = document.querySelectorAll(`[data-flag="${flag}"]`);
        buttons.forEach(btn => {
            if (pressed) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
    
    private handleDPADStart(event: TouchEvent, direction: string, flag: number) {
        event.preventDefault();
        event.stopPropagation();
        this.dpadActive = direction;
        this.state.buttons.add(flag);
    }
    
    private handleDPADEnd() {
        if (this.dpadActive) {
            const key = this.dpadActive.toUpperCase() as keyof typeof BUTTON_MAP;
            const flag = BUTTON_MAP[key];
            this.state.buttons.delete(flag);
            this.dpadActive = null;
        }
    }
    
    getGamepadState(): GamepadState {
        let buttonFlags = 0;
        this.state.buttons.forEach(flag => { buttonFlags |= flag; });
        
        return {
            buttonFlags,
            leftTrigger: this.state.leftTrigger,
            rightTrigger: this.state.rightTrigger,
            leftStickX: this.state.leftStickX,
            leftStickY: this.state.leftStickY,
            rightStickX: this.state.rightStickX,
            rightStickY: this.state.rightStickY,
        };
    }
    
    show() {
        this.isVisibleFlag = true;
        this.container.style.display = 'block';
    }
    
    hide() {
        this.isVisibleFlag = false;
        this.container.style.display = 'none';
        this.resetState();
    }
    
    toggle() {
        if (this.isVisibleFlag) this.hide();
        else this.show();
    }
    
    getIsVisible(): boolean {
        return this.isVisibleFlag;
    }
    
    getContainer(): HTMLElement {
        return this.container;
    }
    
    private resetState() {
        this.state.buttons.clear();
        this.state.leftStickX = 0;
        this.state.leftStickY = 0;
        this.state.rightStickX = 0;
        this.state.rightStickY = 0;
        this.state.leftTrigger = 0;
        this.state.rightTrigger = 0;
        this.touches.clear();
    }
    
    destroy() {
        this.resetState();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
