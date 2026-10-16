import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type Badge = 'SEE' | 'ASK' | 'DECIDE' | 'DELEGATE';

/** The trust ladder in the header. Each enrichment lights its badge. */
@Injectable({ providedIn: 'root' })
export class Badges {
  readonly all: readonly Badge[] = ['SEE', 'ASK', 'DECIDE', 'DELEGATE'];
  readonly lit = signal<ReadonlySet<Badge>>(new Set());
}

/** Lights badges while the calling component lives. Call in an injection context. */
export function lightBadges(...badges: Badge[]): void {
  const service = inject(Badges);
  service.lit.update((lit) => new Set([...lit, ...badges]));
  inject(DestroyRef).onDestroy(() => service.lit.update((lit) => new Set([...lit].filter((badge) => !badges.includes(badge)))));
}
