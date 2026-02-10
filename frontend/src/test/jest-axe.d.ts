declare module 'jest-axe' {
  export interface AxeViolation {
    impact?: string | null;
  }

  export interface AxeResults {
    violations: AxeViolation[];
  }

  export function axe(
    node: Element | Document | DocumentFragment,
  ): Promise<AxeResults>;
}
