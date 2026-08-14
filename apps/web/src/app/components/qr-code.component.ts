import { Component, ElementRef, effect, input, viewChild } from '@angular/core';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-qr-code',
  template: `<canvas #canvas [attr.aria-label]="'QR code : ' + text()"></canvas>`,
  styles: [
    `
      canvas {
        border-radius: 12px;
        background: white;
        padding: 10px;
      }
    `,
  ],
})
export class QrCodeComponent {
  readonly text = input.required<string>();
  readonly size = input(240);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => {
      void QRCode.toCanvas(this.canvas().nativeElement, this.text(), {
        width: this.size(),
        margin: 0,
        color: { dark: '#101322', light: '#ffffff' },
      });
    });
  }
}
