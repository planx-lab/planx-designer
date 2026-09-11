import { useLayoutEffect, useState } from 'react';

const INVALID = '[data-config-invalid="true"], [data-config-draft-invalid="true"]';

export const hasInvalidConfigDraft = () => document.querySelector(INVALID) !== null;

/** Observe unapplied editor drafts as well as committed store configuration. */
export function useConfigDraftGuard() {
  const [invalid, setInvalid] = useState(hasInvalidConfigDraft);
  useLayoutEffect(() => {
    const update = () => setInvalid(hasInvalidConfigDraft());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-config-invalid', 'data-config-draft-invalid'] });
    return () => observer.disconnect();
  }, []);
  return invalid;
}
