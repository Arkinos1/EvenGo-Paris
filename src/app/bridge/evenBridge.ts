import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { EvenButtonEvent } from '../types';
import { SCROLL_COOLDOWN_MS, SCROLL_EVENT_DEBOUNCE_AFTER_MS } from '../constants';

/**
 * Decode event type from various EvenHub event formats
 * (handles firmware quirks and fallbacks)
 */
function parseEventType(event: any): string | number | undefined {
  return (
    event?.listEvent?.eventType ??
    event?.textEvent?.eventType ??
    event?.sysEvent?.eventType ??
    event?.jsonData?.eventType ??
    event?.jsonData?.event_type ??
    event?.jsonData?.Event_Type ??
    event?.jsonData?.type ??
    event?.jsonData?.listEvent?.eventType ??
    event?.jsonData?.textEvent?.eventType ??
    event?.jsonData?.sysEvent?.eventType
  );
}

/**
 * Manages Even Hub bridge connection and rendering
 */
export class EvenBridge {
  private bridge: EvenAppBridge | null = null;
  private isConnected = false;
  private lastScrollTs = 0;
  private lastScrollDirection: EvenButtonEvent | null = null;
  private readonly logoBytesCache = new Map<string, number[]>();
  private lastTextContent = '';
  private lastTextTs = 0;
  private textLayoutReady = false;

  async connect(onButtonPress: (btn: EvenButtonEvent) => void): Promise<void> {
    if (this.isConnected) return;

    this.bridge = await waitForEvenAppBridge();
    this.isConnected = true;

    if (this.bridge.onEvenHubEvent) {
      this.bridge.onEvenHubEvent((event: any) => {
        this.handleEventAndDispatch(event, onButtonPress);
      });
    }
  }

  private handleEventAndDispatch(event: any, onButtonPress: (btn: EvenButtonEvent) => void): void {
    const eventType = parseEventType(event);
    const now = Date.now();

    // Firmware quirk: empty event after scroll within debounce window = ignore
    if (eventType === undefined || eventType === null) {
      if (now - this.lastScrollTs < Math.max(450, SCROLL_EVENT_DEBOUNCE_AFTER_MS)) {
        return; // Debounced phantom click
      }
      onButtonPress('click');
      return;
    }

    const typeStr = String(eventType).toUpperCase();

    if (typeStr === '3' || typeStr.includes('DOUBLE')) {
      onButtonPress('double_click');
    } else if (typeStr === '0' || typeStr.includes('CLICK')) {
      if (now - this.lastScrollTs < Math.max(450, SCROLL_EVENT_DEBOUNCE_AFTER_MS)) {
        return;
      }
      onButtonPress('click');
    } else if (typeStr === '1' || typeStr.includes('SCROLL_TOP')) {
      if (now - this.lastScrollTs < SCROLL_COOLDOWN_MS && this.lastScrollDirection === 'scroll_top') {
        return;
      }
      this.lastScrollTs = now;
      this.lastScrollDirection = 'scroll_top';
      onButtonPress('scroll_top');
    } else if (typeStr === '2' || typeStr.includes('SCROLL_BOTTOM')) {
      if (now - this.lastScrollTs < SCROLL_COOLDOWN_MS && this.lastScrollDirection === 'scroll_bottom') {
        return;
      }
      this.lastScrollTs = now;
      this.lastScrollDirection = 'scroll_bottom';
      onButtonPress('scroll_bottom');
    }
  }

  private async renderContainers(
    textContainers: TextContainerProperty[],
    imageContainers: ImageContainerProperty[] = []
  ): Promise<boolean> {
    if (!this.bridge) return false;

    const payload = {
      containerTotalNum: textContainers.length + imageContainers.length,
      textObject: textContainers,
      imageObject: imageContainers,
    };

    if (await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(payload)) === 0) {
      return true;
    }

    if (this.bridge.rebuildPageContainer) {
      return await this.bridge.rebuildPageContainer(new RebuildPageContainer(payload)) === true;
    }

    return false;
  }

  /**
   * Display simple single-text container
   */
  async displayText(content: string): Promise<boolean> {
    if (!this.bridge) return false;

    const formattedContent = content || ' ';

    const now = Date.now();
    if (formattedContent === this.lastTextContent && now - this.lastTextTs < 220) {
      return true;
    }
    this.lastTextContent = formattedContent;
    this.lastTextTs = now;

    if (this.textLayoutReady && this.bridge.textContainerUpgrade) {
      try {
        await this.bridge.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: 1,
            containerName: 'main_text',
            contentOffset: 0,
            contentLength: 4096,
            content: formattedContent,
          })
        );
        return true;
      } catch {
        this.textLayoutReady = false;
      }
    }

    const textContainer = new TextContainerProperty({
      containerID: 1,
      containerName: 'main_text',
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      paddingLength: 0,
      content: formattedContent,
      isEventCapture: 1, // Required to capture clicks
    });

    const rendered = await this.renderContainers([textContainer]);
    if (rendered) {
      this.textLayoutReady = true;
    }
    return rendered;
  }

  private async loadLogoBytes(logoPath: string, width: number, height: number): Promise<number[] | null> {
    const cacheKey = `${logoPath}|${width}x${height}`;
    const cached = this.logoBytesCache.get(cacheKey);
    if (cached) return cached;

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load logo: ${logoPath}`));
        image.src = logoPath;
      });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/png');
      const binary = atob(dataUrl.split(',')[1] || '');
      const bytes: number[] = [];
      for (let i = 0; i < binary.length; i++) {
        bytes.push(binary.charCodeAt(i));
      }

      this.logoBytesCache.set(cacheKey, bytes);
      return bytes;
    } catch {
      return null;
    }
  }

  async displayTextWithLogo(content: string, logoPath: string): Promise<boolean> {
    if (!this.bridge) return false;
    this.textLayoutReady = false;

    const logoW = 120;
    const logoH = 100;
    const textContainer = new TextContainerProperty({
      containerID: 1,
      containerName: 'main_text',
      xPosition: 0,
      yPosition: 0,
      width: 446,
      height: 288,
      paddingLength: 0,
      content,
      isEventCapture: 1,
    });

    const logoContainer = new ImageContainerProperty({
      containerID: 2,
      containerName: 'transport_logo',
      xPosition: 452,
      yPosition: 94,
      width: logoW,
      height: logoH,
    });

    const rendered = await this.renderContainers([textContainer], [logoContainer]);
    if (!rendered) return false;

    const bytes = await this.loadLogoBytes(logoPath, logoW, logoH);
    if (!bytes) return this.displayText(content);

    const updateResult = await this.bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: 2,
        containerName: 'transport_logo',
        imageData: bytes,
      })
    );

    if (!ImageRawDataUpdateResult.isSuccess(updateResult)) {
      return this.displayText(content);
    }

    return true;
  }

  /**
   * Display summary and optional logos row at bottom
   */
  async displaySummary(content: string, logos: string[] = []): Promise<boolean> {
    if (!this.bridge) return false;
    this.textLayoutReady = false;

    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const uniqueLogos = logos
      .filter((logo) => typeof logo === 'string' && logo.trim().length > 0)
      .filter((logo, index, items) => items.indexOf(logo) === index)
      .slice(0, 4);
    const hasLogos = uniqueLogos.length > 0;

    const baseY = 18;
    const lineHeight = 46;
    const maxLines = hasLogos ? 3 : 4;
    const summaryContainers = lines.slice(0, maxLines).map(
      (line, index) =>
        new TextContainerProperty({
          containerID: index + 1,
          containerName: `summary_${index + 1}`,
          xPosition: 0,
          yPosition: baseY + index * lineHeight,
          width: 576,
          height: 36,
          paddingLength: 0,
          content: line,
          isEventCapture: index === Math.min(lines.length, maxLines) - 1 ? 1 : 0,
        })
    );

    if (!hasLogos) {
      return this.renderContainers(summaryContainers);
    }

    const logoW = 80;
    const logoH = 60;
    const gap = 12;
    const rowWidth = uniqueLogos.length * logoW + (uniqueLogos.length - 1) * gap;
    const startX = Math.floor((576 - rowWidth) / 2);
    const y = 220;
    const baseId = summaryContainers.length;

    const imageContainers = uniqueLogos.map(
      (_, index) =>
        new ImageContainerProperty({
          containerID: baseId + index + 1,
          containerName: `summary_logo_${index + 1}`,
          xPosition: startX + index * (logoW + gap),
          yPosition: y,
          width: logoW,
          height: logoH,
        })
    );

    const rendered = await this.renderContainers(summaryContainers, imageContainers);
    if (!rendered) return false;

    for (let i = 0; i < uniqueLogos.length; i++) {
      const logoPath = uniqueLogos[i];
      if (!logoPath) continue;

      const bytes = await this.loadLogoBytes(logoPath, logoW, logoH);
      if (!bytes) continue;

      const result = await this.bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: baseId + i + 1,
          containerName: `summary_logo_${i + 1}`,
          imageData: bytes,
        })
      );

      if (!ImageRawDataUpdateResult.isSuccess(result)) {
        continue;
      }
    }

    return true;
  }

  isReady(): boolean {
    return this.isConnected && this.bridge !== null;
  }
}
