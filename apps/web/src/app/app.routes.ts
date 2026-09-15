import type { Routes } from '@angular/router';

// One route per example, in the order of the talk.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'sse' },
  {
    path: 'sse',
    title: '1 · AG-UI client without CopilotKit',
    loadComponent: () => import('./examples/sse-client').then((m) => m.SseClient),
  },
  {
    path: 'copilotkit',
    title: '2 · CopilotKit',
    loadComponent: () => import('./examples/copilot-page').then((m) => m.CopilotPage),
    data: { agentId: 'default' },
  },
  {
    path: 'protobuf',
    title: '3 · CopilotKit over protobuf',
    loadComponent: () => import('./examples/copilot-page').then((m) => m.CopilotPage),
    data: { agentId: 'protobuf' },
  },
  {
    path: 'abo',
    title: '4 · Abo-Killer',
    loadComponent: () => import('./abo/abo-page').then((m) => m.AboPage),
  },
];
