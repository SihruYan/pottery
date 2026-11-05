import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { FortuneFile } from './fortune.models';

@Injectable({ providedIn: 'root' })
export class FortuneService {
  private readonly http = inject(HttpClient);
  private lastIndex = -1;

  load(): Observable<FortuneFile> {
    return this.http.get<FortuneFile>('fortunes.json');
  }

  draw(fortunes: readonly string[]): string {
    let index = Math.floor(Math.random() * fortunes.length);
    if (index === this.lastIndex) index = (index + 1) % fortunes.length;
    this.lastIndex = index;
    return fortunes[index];
  }
}
