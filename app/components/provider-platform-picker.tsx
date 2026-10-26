import { useEffect, useMemo, useRef, useState } from "react";
import {
  PROVIDER_PLATFORMS,
  type ProviderPlatform,
} from "../client/provider-platforms";
import Locale from "../locales";
import { IconButton } from "./button";
import { Modal } from "./ui-lib";
import styles from "./model-services.styles";

export function ProviderPlatformPicker(props: {
  onSelect: (platform: ProviderPlatform) => void;
  onClose: () => void;
}) {
  const t = Locale.ModelServices;
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const platforms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return PROVIDER_PLATFORMS.filter((platform) =>
      [
        platform.name,
        platform.id,
        ...platform.aliases,
        ...Object.values(platform.baseUrls),
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search]);

  useEffect(() => {
    const trigger = document.activeElement;
    searchRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);

  return (
    <Modal
      title={t.ChoosePlatform}
      onClose={props.onClose}
      actions={[
        <IconButton key="cancel" text={t.Cancel} onClick={props.onClose} />,
      ]}
    >
      <div className={styles.platformPicker}>
        <input
          ref={searchRef}
          type="search"
          className={styles.platformSearch}
          aria-label={t.SearchPlatforms}
          placeholder={t.SearchPlatforms}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <div className={styles.platformList}>
          {platforms.length ? (
            <table
              className={styles.platformTable}
              aria-label={t.ChoosePlatform}
            >
              <tbody>
                {platforms.map((platform) => {
                  const baseUrl = platform.baseUrls[platform.defaultProtocol];
                  return (
                    <tr
                      key={platform.id}
                      onClick={() => props.onSelect(platform)}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.platform}
                          aria-label={platform.name}
                          title={platform.name}
                        >
                          {platform.name}
                        </button>
                      </td>
                      <td className={styles.platformUrl} title={baseUrl}>
                        {baseUrl}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.empty} role="status">
              {t.NoMatchingPlatforms}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
