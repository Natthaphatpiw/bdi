"use client";

import { useEffect, useState } from "react";

export function useShareQr(url: string | null) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setDataUrl(null);
    if (!url) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 320,
          color: { dark: "#0F172A", light: "#FFFFFF" },
        }),
      )
      .then((result) => {
        if (active) setDataUrl(result);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url]);

  return { dataUrl, loading };
}
