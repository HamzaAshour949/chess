import { useEffect, useState } from "react";

/** `value`, but only after it has stopped changing for `delay` ms. */
export function useDebounced(value, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return settled;
}
