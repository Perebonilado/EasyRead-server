/**
 * Walking and cutting a parsed drawing: the few DOM moves the gate and the
 * label lifter share.
 */
import { Element, Text, type ChildNode } from 'domhandler';

export const elements = (nodes: ChildNode[]): Element[] =>
  nodes.filter((node): node is Element => node instanceof Element);

/** Every element under a node, the node first, in document order. */
export function* walk(node: Element): Generator<Element> {
  yield node;
  for (const child of elements(node.children)) yield* walk(child);
}

/** All the text under a node, as written. */
export function textOf(node: Element): string {
  let out = '';
  for (const child of node.children) {
    if (child instanceof Text) out += child.data;
    else if ('children' in child) out += textOf(child as Element);
  }
  return out;
}

export function removeNode(node: Element): void {
  const parent = node.parent as Element | null;
  if (!parent) return;
  parent.children = parent.children.filter((child) => child !== node);
}

/** The element with this id under a node, if there is one. */
export function byId(root: Element, id: string): Element | null {
  for (const node of walk(root)) if (node.attribs.id === id) return node;
  return null;
}
