export interface WelcomeScreenProps {
  onDismiss: () => void;
}

/**
 * First-launch, once-per-install screen (ui-atlas-layout-mapping.md §5) —
 * deliberately its own full-screen overlay, not a Dialog instance: no
 * backdrop-click/Escape dismiss, since there's nothing behind it to click
 * past and it should only ever go away via an explicit choice.
 */
export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  return (
    <div className="mep-onboarding">
      <div className="mep-onboarding-card">
        <h1>MepApp</h1>
        <p>
          MepApp is an open-source CAD (computer-aided design) tool for drawing annotated HVAC, electrical, plumbing, and fire-protection elements onto PDF
          architectural drawings.
        </p>
        <p className="mep-onboarding-license">
          Fully open source under the AGPLv3 (GNU Affero General Public License, version 3) — no paid SDKs or libraries, anywhere.
        </p>
        <button type="button" className="mep-onboarding-start" onClick={onDismiss}>
          Get Started
        </button>
      </div>
    </div>
  );
}
