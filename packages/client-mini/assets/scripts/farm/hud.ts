/**
 * hud — TopHud: currency plaques (batch H kit), avatar/level placeholder,
 * connection dot + disconnect banner (implementation-plan-ui-v13.md U10).
 *
 * The kit's ui_panel_gold_bar / ui_panel_cash_bar are square wooden plaques
 * with a coin/gem emblem; the amount Label sits in their dark inner area.
 * All plaque nodes are edge-anchored via Widget (Fit-Height keeps width free).
 */

import { Color, Label, Node } from 'cc';
import type { SpriteMap } from './assets';
import { UI, applyWidget } from './layout';
import { circle, makeLabel, makeSprite, roundRect, sizedNode, withOpacity } from './widgets';

export class Hud {
  private goldLabel: Label;
  private goldPanelNode: Node;
  private cashLabel: Label;
  private dotGreen: Node;
  private dotRed: Node;
  private banner: Node;
  /** Set on every coins_changed — OnlineFarm.update consumes it for the pulse. */
  goldPulse = 0;
  private lastGold = -1;

  constructor(parent: Node, frames: SpriteMap) {
    const gold = makeSprite('GoldPanel', frames['ui/ui_panel_gold_bar'] ?? null, UI.goldPanel.w, UI.goldPanel.h, parent);
    applyWidget(gold.node, UI.goldPanel.widget);
    this.goldPanelNode = gold.node;
    this.goldLabel = makeLabel('Gold', '0', 26, new Color(255, 236, 160, 255), gold.node);
    this.goldLabel.node.setPosition(0, -12, 0);

    const cash = makeSprite('CashPanel', frames['ui/ui_panel_cash_bar'] ?? null, UI.cashPanel.w, UI.cashPanel.h, parent);
    applyWidget(cash.node, UI.cashPanel.widget);
    this.cashLabel = makeLabel('Cash', '0', 22, new Color(160, 220, 255, 255), cash.node);
    this.cashLabel.node.setPosition(0, -10, 0);

    const avatarNode = sizedNode('Avatar', UI.avatar.r * 2, UI.avatar.r * 2, parent);
    applyWidget(avatarNode, UI.avatar.widget);
    circle(avatarNode, UI.avatar.r, new Color(240, 220, 170, 255), new Color(120, 85, 35, 255));
    const lvLabel = makeLabel('Level', 'Lv.1', 18, new Color(90, 60, 20, 255), avatarNode);
    lvLabel.node.setPosition(0, -UI.avatar.r - 16, 0);

    const dotRoot = sizedNode('ConnDot', UI.connDot.r * 2, UI.connDot.r * 2, parent);
    applyWidget(dotRoot, UI.connDot.widget);
    this.dotGreen = sizedNode('Green', UI.connDot.r * 2, UI.connDot.r * 2, dotRoot);
    circle(this.dotGreen, UI.connDot.r, new Color(90, 200, 90, 255), new Color(30, 90, 30, 255));
    this.dotRed = sizedNode('Red', UI.connDot.r * 2, UI.connDot.r * 2, dotRoot);
    circle(this.dotRed, UI.connDot.r, new Color(210, 70, 50, 255), new Color(90, 20, 10, 255));
    this.dotRed.active = false;

    const bannerNode = sizedNode('DisconnectBanner', UI.disconnectBanner.w, UI.disconnectBanner.h, parent);
    bannerNode.setPosition(0, UI.disconnectBanner.y, 0);
    roundRect(bannerNode, UI.disconnectBanner.w - 24, UI.disconnectBanner.h, 18, new Color(190, 55, 40, 235), new Color(255, 210, 190, 255), 2);
    makeLabel('BannerText', '连接断开，自动重连中…', 26, new Color(255, 245, 240, 255), bannerNode);
    withOpacity(bannerNode).opacity = 0;
    bannerNode.active = false;
    this.banner = bannerNode;
  }

  setGold(gold: number): void {
    if (this.lastGold >= 0 && gold !== this.lastGold) this.goldPulse = 0.35;
    this.lastGold = gold;
    this.goldLabel.string = String(gold);
  }

  setGems(gems: number): void {
    this.cashLabel.string = String(gems);
  }

  setConnected(connected: boolean): void {
    this.dotGreen.active = connected;
    this.dotRed.active = !connected;
    this.showBanner(!connected);
  }

  /** Called from OnlineFarm.update — drives the gold pulse tween. */
  update(dt: number): void {
    if (this.goldPulse > 0) {
      this.goldPulse = Math.max(0, this.goldPulse - dt);
      const t = this.goldPulse / 0.35;
      const s = 1 + 0.18 * Math.sin(t * Math.PI);
      this.goldPanelNode.setScale(s, s, 1);
    }
  }

  showBanner(show: boolean): void {
    this.banner.active = show;
    withOpacity(this.banner).opacity = show ? 255 : 0;
  }
}
