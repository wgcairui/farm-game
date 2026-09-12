/**
 * widgets — small node builders shared by all farm UI modules.
 *
 * Code rules (wechat-devtools "enhance compile" red lines, runbook §10.3):
 *   - Map/Set: .forEach and index loops only — no iterator spread/destructuring.
 *   - Arrays: index loops; no `[...arr]`, no destructuring of iterables.
 */

import {
  Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3,
} from 'cc';

/** Create a plain node with a UITransform size and the 2D UI layer set. */
export function sizedNode(name: string, w: number, h: number, parent?: Node): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  const transform = node.addComponent(UITransform);
  transform.setContentSize(w, h);
  if (parent) node.setParent(parent);
  return node;
}

/** Create a Label node. */
export function makeLabel(
  name: string,
  text: string,
  fontSize: number,
  color: Color,
  parent?: Node,
): Label {
  const node = sizedNode(name, 120, fontSize * 1.4, parent);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.round(fontSize * 1.3);
  label.color = color;
  return label;
}

/** Create a Sprite node with an explicit display size (sizeMode CUSTOM). */
export function makeSprite(name: string, frame: SpriteFrame | null, w: number, h: number, parent?: Node): Sprite {
  const node = sizedNode(name, w, h, parent);
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.type = Sprite.Type.SIMPLE;
  sprite.spriteFrame = frame;
  return sprite;
}

/** Rounded-rect background drawn with Graphics (procedural nine-patch stand-in). */
export function roundRect(
  node: Node,
  w: number,
  h: number,
  radius: number,
  fill: Color,
  stroke?: Color,
  strokeWidth = 3,
): Graphics {
  let g = node.getComponent(Graphics);
  if (!g) g = node.addComponent(Graphics);
  g.lineWidth = strokeWidth;
  g.fillColor = fill;
  g.strokeColor = stroke ?? fill;
  g.roundRect(-w / 2, -h / 2, w, h, radius);
  g.fill();
  if (stroke) g.stroke();
  return g;
}

/** Solid circle (connection dot, avatar placeholder, ...). */
export function circle(node: Node, radius: number, fill: Color, stroke?: Color): Graphics {
  let g = node.getComponent(Graphics);
  if (!g) g = node.addComponent(Graphics);
  g.lineWidth = 3;
  g.fillColor = fill;
  g.strokeColor = stroke ?? fill;
  g.circle(0, 0, radius);
  g.fill();
  if (stroke) g.stroke();
  return g;
}

/** Selection ring for the focused plot (replaces the defective overlay_selected asset). */
export function selectionRing(w: number, h: number, parent: Node): Node {
  const node = sizedNode('SelectionRing', w, h, parent);
  const g = node.addComponent(Graphics);
  g.lineWidth = 5;
  g.strokeColor = new Color(255, 244, 120, 255);
  g.roundRect(-w / 2, -h / 2, w, h, 14);
  g.stroke();
  g.lineWidth = 2;
  g.strokeColor = new Color(80, 50, 10, 255);
  g.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 16);
  g.stroke();
  node.active = false;
  return node;
}

/** Add a UIOpacity component (idempotent) — required for opacity tweens. */
export function withOpacity(node: Node): UIOpacity {
  let op = node.getComponent(UIOpacity);
  if (!op) op = node.addComponent(UIOpacity);
  return op;
}

/** Bottom-center anchored label position helper (labels grow from center). */
export function setPos(node: Node, x: number, y: number): void {
  node.setPosition(new Vec3(x, y, 0));
}
