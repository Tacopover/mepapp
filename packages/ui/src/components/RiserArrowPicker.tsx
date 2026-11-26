import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { RiserArrowPair } from '@mepapp/core';
import { ARROW_CHOICES, arrowChoiceOf, NO_ARROWS_TEXT, NO_ARROWS_TITLE, nextArrowIndex, RISER_ARROWS_LABEL, USE_SOLVE_TEXT, USE_SOLVE_TITLE } from '../riserArrowPicker.js';
import { RiserArrowIcon } from './RiserArrowIcon.js';

export interface RiserArrowPickerProps {
  /** The pair that the ring shows now. Only used to mark a choice when handSet is true. */
  pair: RiserArrowPair;
  /** true: the pair was set by hand. false: it comes from the flow solve (no choice is marked; "Use the flow solve" shows a check mark and is dim). */
  handSet: boolean;
  variant: 'menu' | 'panel';
  onChoose(pair: RiserArrowPair): void;
  onUseSolve(): void;
}

const NONE_INDEX = ARROW_CHOICES.length - 1;

export function RiserArrowPicker({ pair, handSet, variant, onChoose, onUseSolve }: RiserArrowPickerProps) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosenId = arrowChoiceOf(pair).id;
  const chosenIndex = ARROW_CHOICES.findIndex((choice) => choice.id === chosenId);
  const rovingIndex = focusIndex ?? (handSet ? chosenIndex : 0);

  function choose(index: number) {
    setFocusIndex(index);
    onChoose(ARROW_CHOICES[index]!.pair);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const attr = (event.target as HTMLElement).closest('[data-index]')?.getAttribute('data-index');
    if (!attr) return;
    const next = nextArrowIndex(Number(attr), event.key);
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusIndex(null);
  }

  return (
    <div className={`mep-arrow-picker mep-arrow-picker--${variant}`} data-testid="riser-arrow-picker">
      <div role="radiogroup" aria-label={RISER_ARROWS_LABEL} className="mep-arrow-picker-set" onKeyDown={onKeyDown} onBlur={onBlur}>
        <div className="mep-arrow-picker-grid">
          {ARROW_CHOICES.slice(0, NONE_INDEX).map((choice, index) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              className="mep-arrow-cell"
              data-testid={`riser-arrow-${choice.id}`}
              data-index={index}
              aria-checked={handSet && choice.id === chosenId}
              aria-label={choice.title}
              title={choice.title}
              tabIndex={index === rovingIndex ? 0 : -1}
              onClick={() => choose(index)}
              ref={(element) => {
                refs.current[index] = element;
              }}
            >
              <RiserArrowIcon pair={choice.pair} />
            </button>
          ))}
        </div>
        <button
          type="button"
          role="radio"
          className="mep-arrow-text"
          data-testid="riser-arrow-none"
          data-index={NONE_INDEX}
          aria-checked={handSet && chosenId === 'none'}
          aria-label={NO_ARROWS_TEXT}
          title={NO_ARROWS_TITLE}
          tabIndex={NONE_INDEX === rovingIndex ? 0 : -1}
          onClick={() => choose(NONE_INDEX)}
          ref={(element) => {
            refs.current[NONE_INDEX] = element;
          }}
        >
          <span className="mep-arrow-check" aria-hidden="true">{handSet && chosenId === 'none' ? '✓' : ''}</span>{NO_ARROWS_TEXT}
        </button>
      </div>
      <button
        type="button"
        className={`mep-arrow-text${handSet ? '' : ' mep-arrow-text--dim'}`}
        data-testid="riser-arrow-solve"
        aria-disabled={handSet ? undefined : 'true'}
        tabIndex={handSet ? 0 : -1}
        title={USE_SOLVE_TITLE}
        onClick={() => {
          if (handSet) onUseSolve();
        }}
      >
        <span className="mep-arrow-check" aria-hidden="true">{handSet ? '' : '✓'}</span>{USE_SOLVE_TEXT}
      </button>
    </div>
  );
}
