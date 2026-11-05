import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { CookieAudio } from './cookie-audio';
import { PageCopy } from './fortune.models';
import { FortuneService } from './fortune.service';

type Phase = 'idle' | 'opening' | 'open' | 'closing';
type OpenSource = 'tap' | 'drag';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App implements OnDestroy {
  private readonly fortuneService = inject(FortuneService);
  private readonly audio = new CookieAudio();
  private readonly burstHost = viewChild<ElementRef<HTMLDivElement>>('burst');
  private readonly today = new Date();
  private readonly dateLabel = `${this.today.getMonth() + 1}月${this.today.getDate()}日`;

  private fortunes: string[] = [];
  private destroyed = false;
  private loadSub: Subscription | null = null;
  private timers: number[] = [];
  private toastTimer = 0;
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private moved = 0;
  private suppressClick = false;
  private memoryCount = 0;

  protected readonly copy = signal<PageCopy | null>(null);
  protected readonly loadError = signal(false);
  protected readonly phase = signal<Phase>('idle');
  protected readonly taps = signal(0);
  protected readonly isOpen = signal(false);
  protected readonly forceCrack = signal(false);
  protected readonly pulling = signal(false);
  protected readonly squish = signal(false);
  protected readonly trembling = signal(false);
  protected readonly muted = signal(readMuted());
  protected readonly count = signal(this.readCount());
  protected readonly fortune = signal<string | null>(null);
  protected readonly hint = signal('');
  protected readonly bubble = signal('');
  protected readonly bubbleOn = signal(false);
  protected readonly toastText = signal('');
  protected readonly toastOn = signal(false);
  protected readonly split = signal('0');
  protected readonly lookX = signal('0px');
  protected readonly lookY = signal('0px');

  protected readonly idleFloat = computed(
    () => this.phase() === 'idle' && this.taps() === 0 && !this.pulling(),
  );
  protected readonly slipDate = computed(() =>
    (this.copy()?.slipDate ?? '{date}的小籤').replace('{date}', this.dateLabel),
  );
  protected readonly countText = computed(() =>
    (this.copy()?.todayCount ?? '今天 {n} 塊').replace('{n}', String(this.count())),
  );

  constructor() {
    this.loadSub = this.fortuneService.load().subscribe({
      next: (file) => {
        if (this.destroyed) return;
        if (!file?.page || !Array.isArray(file.fortunes)) {
          this.loadError.set(true);
          return;
        }
        this.copy.set(file.page);
        this.fortunes = file.fortunes;
        this.hint.set(file.page.hints[0] ?? '');
        document.title = file.page.title;
      },
      error: (error: HttpErrorResponse) => {
        console.error(error);
        if (!this.destroyed) this.loadError.set(true);
      },
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadSub?.unsubscribe();
    this.timers.forEach((id) => window.clearTimeout(id));
    window.clearTimeout(this.toastTimer);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.phase() !== 'idle') return;
    const button = event.currentTarget as HTMLButtonElement;
    this.pointerId = event.pointerId;
    button.setPointerCapture(event.pointerId);
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.pulling.set(true);
    this.moved = 0;
    this.lookAt(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.pulling() || event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    this.moved = Math.max(this.moved, Math.hypot(dx, dy));
    const split = Math.min(100, Math.abs(dx) * 0.85 + Math.max(0, -dy) * 0.35);
    this.split.set(split.toFixed(1));
    if (split > 18) this.forceCrack.set(true);
    this.lookAt(event);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.pulling() || event.pointerId !== this.pointerId) return;
    this.pulling.set(false);
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    const split = Math.abs(dx) * 0.85 + Math.max(0, -dy) * 0.35;
    this.lookReset();
    this.suppressClick = true;
    if (this.phase() !== 'idle') return;
    if (split > 64) {
      this.openCookie('drag');
      return;
    }
    this.split.set('0');
    if (this.moved < 12) this.onTap();
    else {
      this.showBubble(this.copy()?.bubbles.dragFail ?? '');
      if (this.taps() < 2) this.forceCrack.set(false);
    }
  }

  protected onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.pulling.set(false);
    this.split.set('0');
    this.lookReset();
    if (this.taps() < 2) this.forceCrack.set(false);
  }

  protected onClick(event: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.preventDefault();
      return;
    }
    this.onTap();
  }

  protected closeCookie(): void {
    if (this.phase() !== 'open') return;
    this.phase.set('closing');
    this.taps.set(0);
    this.isOpen.set(false);
    this.forceCrack.set(false);
    this.split.set('0');
    this.lookReset();
    this.hint.set(this.copy()?.hints[0] ?? '');
    this.later(620, () => this.phase.set('idle'));
  }

  protected async copyFortune(): Promise<void> {
    const current = this.fortune();
    const copy = this.copy();
    if (!current || !copy) return;
    const line = `${current}\n—— ${this.slipDate()}`;
    try {
      await navigator.clipboard.writeText(line);
      this.toast(copy.copied);
    } catch {
      this.toast(copy.copyFailed);
    }
  }

  protected toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    try {
      localStorage.setItem('fortune-cookie-muted', next ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (!next) this.audio.playBlip(false);
  }

  private onTap(): void {
    const copy = this.copy();
    if (!copy || this.phase() !== 'idle') return;
    const next = this.taps() + 1;
    this.taps.set(next);
    this.audio.playTap(next, this.muted());
    this.vibrate(12);
    this.trembling.set(true);
    this.later(360, () => this.trembling.set(false));
    if (next === 1) {
      this.hint.set(copy.hints[1] ?? copy.hints[0] ?? '');
      this.showBubble(copy.bubbles.tap1);
    } else if (next === 2) {
      this.hint.set(copy.hints[2] ?? copy.hints[1] ?? '');
      this.showBubble(copy.bubbles.tap2);
    }
    if (next >= 3) this.openCookie('tap');
  }

  private openCookie(source: OpenSource): void {
    const copy = this.copy();
    if (!copy || this.phase() !== 'idle') return;
    if (this.fortunes.length === 0) {
      this.split.set('0');
      this.toast(copy.emptyFortunes);
      return;
    }
    this.phase.set('opening');
    this.forceCrack.set(true);
    this.squish.set(true);
    this.trembling.set(false);
    const line = source === 'drag' ? copy.bubbles.openDrag : copy.bubbles.openTap;
    this.showBubble(line);
    this.audio.playOpen(this.muted());
    this.vibrate([14, 36, 20]);
    this.fortune.set(this.fortuneService.draw(this.fortunes));
    const nextCount = this.readCount() + 1;
    this.writeCount(nextCount);
    this.count.set(nextCount);
    this.burst();
    this.later(190, () => {
      this.squish.set(false);
      this.isOpen.set(true);
      this.split.set('0');
      this.taps.set(3);
      this.hint.set(copy.openHint);
      this.later(700, () => this.phase.set('open'));
    });
  }

  private showBubble(text: string): void {
    if (!text) return;
    this.bubble.set(text);
    this.bubbleOn.set(false);
    this.later(30, () => this.bubbleOn.set(true));
  }

  private toast(message: string): void {
    if (!message) return;
    this.toastText.set(message);
    this.toastOn.set(true);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (!this.destroyed) this.toastOn.set(false);
    }, 2200);
  }

  private burst(): void {
    const layer = this.burstHost()?.nativeElement;
    if (!layer) return;
    const glyphs = ['✦', '✧', '♡', '✦'];
    for (let i = 0; i < 18; i += 1) {
      const el = document.createElement('span');
      const crumb = i % 3 === 0;
      el.className = crumb ? `spark crumb${i % 2 ? ' alt' : ''}` : 'spark';
      if (!crumb) {
        el.textContent = glyphs[i % glyphs.length];
        el.style.color = i % 2 ? '#e9897a' : '#e7a23a';
      }
      const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
      const dist = 54 + Math.random() * 86;
      el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(angle) * dist - 16}px`);
      el.style.setProperty('--rot', `${Math.random() * 140 - 70}deg`);
      el.style.setProperty('--delay', `${Math.random() * 0.08}s`);
      el.style.setProperty('--size', `${12 + Math.random() * 8}px`);
      layer.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }
  }

  private lookAt(event: PointerEvent): void {
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    this.lookX.set(`${Math.max(-1, Math.min(1, dx)) * 3}px`);
    this.lookY.set(`${Math.max(-1, Math.min(1, dy)) * 3}px`);
  }

  private lookReset(): void {
    this.lookX.set('0px');
    this.lookY.set('0px');
  }

  private later(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      if (!this.destroyed) fn();
    }, ms);
    this.timers.push(id);
  }

  private vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* some browsers throw */
    }
  }

  private storageKey(): string {
    const month = String(this.today.getMonth() + 1).padStart(2, '0');
    const day = String(this.today.getDate()).padStart(2, '0');
    return `fortune-cookie-${this.today.getFullYear()}-${month}-${day}`;
  }

  private readCount(): number {
    try {
      return Number(localStorage.getItem(this.storageKey()) || 0) || 0;
    } catch {
      return this.memoryCount;
    }
  }

  private writeCount(value: number): void {
    this.memoryCount = value;
    try {
      localStorage.setItem(this.storageKey(), String(value));
    } catch {
      /* private mode */
    }
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem('fortune-cookie-muted') === '1';
  } catch {
    return false;
  }
}
