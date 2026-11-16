import { type ComponentProps } from "solid-js"
import { glyphs, viewBox } from "../typography/wordmark/glyphs"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

/** TekuCode's TC monogram, in the same pixel grid as the wordmark's first two glyphs. */
export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 56 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 6H24V12H15V36H9V12H0V6Z" fill="var(--icon-strong-base)" />
      <path d="M32 6H56V12H38V30H56V36H32V6Z" fill="var(--icon-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        {glyphs.map((glyph) => (
          <g>
            <path d={glyph.weak} fill="var(--icon-weak-base)" />
            <path d={glyph.stem} fill={glyph.strong ? "var(--icon-strong-base)" : "var(--icon-base)"} />
          </g>
        ))}
      </g>
    </svg>
  )
}
