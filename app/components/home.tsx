"use client";

import { useEffect, useState } from "react";
import styles from "./home.styles";

import BotIcon from "../icons/nextchat-bot.svg";
import LoadingIcon from "../icons/three-dots.svg";

import { useMobileScreen } from "../utils";
import { watchTheme } from "../utils/theme";

import dynamic from "next/dynamic";
import { Path, SlotID } from "../constant";
import { ErrorBoundary } from "./error";

import { getISOLang } from "../locales";

import {
  HashRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { SideBar } from "./sidebar";
import { useAppConfig } from "../store/config";
import { AuthPage } from "./auth";
import { getClientConfig } from "../config/client";
import { type ClientApi, getClientApi } from "../client/api";
import { useAccessStore } from "../store";
import { useInsertionEffect } from "react";
import { installBrowserNavigationGuard } from "../utils/unsaved-navigation";
import { useChatStore } from "../store/chat";
import { useMaskStore } from "../store/mask";
import clsx from "clsx";
import { initializeDesktopWindowSettings } from "../utils/desktop-window";

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={clsx("no-dark", styles["loading-content"])}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

const Artifacts = dynamic(async () => (await import("./artifacts")).Artifacts, {
  loading: () => <Loading noLogo />,
});

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});

const Chat = dynamic(async () => (await import("./chat")).Chat, {
  loading: () => <Loading noLogo />,
});

const NewChat = dynamic(async () => (await import("./new-chat")).NewChat, {
  loading: () => <Loading noLogo />,
});

const MaskPage = dynamic(async () => (await import("./mask")).MaskPage, {
  loading: () => <Loading noLogo />,
});

export function useSwitchTheme() {
  const theme = useAppConfig((state) => state.theme);

  useEffect(() => watchTheme(theme), [theme]);
}

function useHtmlLang() {
  useEffect(() => {
    const lang = getISOLang();
    const htmlLang = document.documentElement.lang;

    if (lang !== htmlLang) {
      document.documentElement.lang = lang;
    }
  }, []);
}

const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
};

const loadAsyncGoogleFont = () => {
  const linkEl = document.createElement("link");
  const proxyFontUrl = "/google-fonts";
  const remoteFontUrl = "https://fonts.googleapis.com";
  const googleFontUrl =
    getClientConfig()?.buildMode === "export" ? remoteFontUrl : proxyFontUrl;
  linkEl.rel = "stylesheet";
  linkEl.href =
    googleFontUrl +
    "/css2?family=" +
    encodeURIComponent("Noto Sans:wght@300;400;700;900") +
    "&display=swap";
  document.head.appendChild(linkEl);
};

export function WindowContent(props: { children: React.ReactNode }) {
  return (
    <div className={styles["window-content"]} id={SlotID.AppBody}>
      {props?.children}
    </div>
  );
}

function Screen() {
  const config = useAppConfig();
  const location = useLocation();
  const isArtifact = location.pathname.includes(Path.Artifacts);
  const isHome = location.pathname === Path.Home;
  const isAuth = location.pathname === Path.Auth;

  const isMobileScreen = useMobileScreen();
  const shouldTightBorder =
    getClientConfig()?.isApp || (config.tightBorder && !isMobileScreen);

  useEffect(() => {
    loadAsyncGoogleFont();
  }, []);

  if (isArtifact) {
    return (
      <Routes>
        <Route path="/artifacts/:id" element={<Artifacts />} />
      </Routes>
    );
  }
  const renderContent = () => {
    if (isAuth) return <AuthPage />;
    return (
      <>
        <SideBar
          className={clsx({
            [styles["sidebar-show"]]: isHome,
          })}
        />
        <WindowContent>
          <Routes>
            <Route path={Path.Home} element={<Chat />} />
            <Route path={Path.NewChat} element={<NewChat />} />
            <Route path={Path.Masks} element={<MaskPage />} />

            <Route path={Path.Chat} element={<Chat />} />
            <Route path={Path.Settings} element={<Settings />} />
            {getClientConfig()?.isApp && (
              <Route
                path={Path.ModelServices}
                element={
                  <Navigate
                    to={{ pathname: Path.Settings, search: location.search }}
                    state={location.state}
                    replace
                  />
                }
              />
            )}
            <Route path="*" element={<Chat />} />
          </Routes>
        </WindowContent>
      </>
    );
  };

  return (
    <div
      className={clsx(styles.container, {
        [styles["tight-container"]]: shouldTightBorder,
      })}
    >
      {renderContent()}
    </div>
  );
}

export function useLoadData() {
  const config = useAppConfig();
  const access = useAccessStore();
  const chats = useChatStore();
  const masks = useMaskStore();
  useEffect(() => {
    if (
      getClientConfig()?.isApp &&
      access._hasHydrated &&
      config._hasHydrated
    ) {
      access.initializeProviders(
        config.models,
        [config.customModels, access.customModels].join(","),
      );
      if (chats._hasHydrated && masks._hasHydrated) {
        access.initializeConnectionManager(
          config.models,
          [config.customModels, access.customModels].join(","),
          [
            config.modelConfig,
            ...chats.sessions.map((s) => s.mask.modelConfig),
            ...Object.values(masks.masks).map((m) => m.modelConfig),
          ],
        );
      }
    }
  }, [access, config, chats, masks]);

  const api: ClientApi = getClientApi(config.modelConfig.providerName);

  useEffect(() => {
    (async () => {
      const models = await api.llm.models();
      config.mergeModels(models);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Home() {
  useEffect(initializeDesktopWindowSettings, []);
  useInsertionEffect(installBrowserNavigationGuard, []);
  useSwitchTheme();
  useLoadData();
  useHtmlLang();

  useEffect(() => {
    console.log("[Config] got config from build time", getClientConfig());
    useAccessStore.getState().fetch();
  }, []);

  if (!useHasHydrated()) {
    return <Loading />;
  }

  return (
    <ErrorBoundary>
      <Router>
        <Screen />
      </Router>
    </ErrorBoundary>
  );
}
