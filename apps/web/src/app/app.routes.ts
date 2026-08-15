import { Routes } from '@angular/router';
import { AdminPage } from './pages/admin.page';
import { HomePage } from './pages/home.page';
import { JoinPage } from './pages/join.page';
import { HostPage } from './pages/host/host.page';
import { PlayerPage } from './pages/player/player.page';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'join/:code', component: JoinPage },
  { path: 'host/:code', component: HostPage },
  { path: 'room/:code', component: PlayerPage },
  { path: 'admin', component: AdminPage },
  { path: '**', redirectTo: '' },
];
