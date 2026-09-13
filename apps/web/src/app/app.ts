import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Badges } from './badges';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app">
      <header class="app-header">
        <div>
          <h1>AG-UI teammate</h1>
          <p>AG-UI agent · Gemma 4 on llama.cpp · Angular</p>
        </div>
        <ul class="badges">
          @for (badge of badges.all; track badge) {
            <li [attr.data-on]="badges.lit().has(badge) || null">{{ badge }}</li>
          }
        </ul>
      </header>
      <nav class="examples">
        <a routerLink="/sse" routerLinkActive="active">1 · AG-UI client without CopilotKit</a>
        <a routerLink="/copilotkit" routerLinkActive="active">2 · CopilotKit</a>
        <a routerLink="/protobuf" routerLinkActive="active">3 · CopilotKit + protobuf</a>
        <a routerLink="/abo" routerLinkActive="active">4 · Abo-Killer</a>
      </nav>
      <main class="page">
        <router-outlet />
      </main>
    </div>
  `,
})
export class App {
  protected readonly badges = inject(Badges);
}
