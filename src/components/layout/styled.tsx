import React from 'react';
import styled from 'styled-components';
import { Container, Content, Divider, Footer, Header, Nav, Sidebar } from 'rsuite';

// Layout.tsx
export const RootContainer = styled(Container)`
  /* ── app-* CSS variables — defined once here, consumed everywhere as var(--app-*) ── */
  --app-primary: ${(props) => props.theme.colors?.primary};
  --app-text: ${(props) => props.theme.colors?.layout?.page?.color};
  --app-text-secondary: ${(props) => props.theme.colors?.layout?.page?.colorSecondary};
  --app-bg: ${(props) => props.theme.colors?.layout?.page?.background};
  --app-sidebar-bg: ${(props) => props.theme.colors?.layout?.sideBar?.background};
  --app-sidebar-btn: ${(props) => props.theme.colors?.layout?.sideBar?.button?.color};
  --app-sidebar-btn-hover: ${(props) => props.theme.colors?.layout?.sideBar?.button?.colorHover};
  --app-titlebar-bg: ${(props) => props.theme.colors?.layout?.titleBar?.background};
  --app-titlebar-color: ${(props) => props.theme.colors?.layout?.titleBar?.color};
  --app-playerbar-bg: ${(props) => props.theme.colors?.layout?.playerBar?.background};
  --app-playerbar-color: ${(props) => props.theme.colors?.layout?.playerBar?.color};
  --app-playerbar-color-secondary: ${(props) =>
    props.theme.colors?.layout?.playerBar?.colorSecondary};
  --app-playerbar-btn: ${(props) => props.theme.colors?.layout?.playerBar?.button?.color};
  --app-playerbar-btn-hover: ${(props) =>
    props.theme.colors?.layout?.playerBar?.button?.colorHover};
  --app-playerbar-border-top: ${(props) => props.theme.other?.playerBar?.borderTop};
  --app-playerbar-border-right: ${(props) => props.theme.other?.playerBar?.borderRight};
  --app-playerbar-border-bottom: ${(props) => props.theme.other?.playerBar?.borderBottom};
  --app-playerbar-border-left: ${(props) => props.theme.other?.playerBar?.borderLeft};
  --app-playerbar-filter: ${(props) => props.theme.other?.playerBar?.filter};
  --app-miniplayer-bg: ${(props) => props.theme.colors?.layout?.miniPlayer?.background};
  --app-miniplayer-height: ${(props) => props.theme.other?.miniPlayer?.height};
  --app-miniplayer-opacity: ${(props) => props.theme.other?.miniPlayer?.opacity};
  --app-btn-default-bg: ${(props) => props.theme.colors?.button?.default?.background};
  --app-btn-default-bg-hover: ${(props) => props.theme.colors?.button?.default?.backgroundHover};
  --app-btn-default-color: ${(props) => props.theme.colors?.button?.default?.color};
  --app-btn-default-color-hover: ${(props) => props.theme.colors?.button?.default?.colorHover};
  --app-btn-primary-color: ${(props) => props.theme.colors?.button?.primary?.color};
  --app-btn-primary-color-hover: ${(props) => props.theme.colors?.button?.primary?.colorHover};
  --app-btn-primary-bg-hover: ${(props) => props.theme.colors?.button?.primary?.backgroundHover};
  --app-btn-subtle-color: ${(props) => props.theme.colors?.button?.subtle?.color};
  --app-btn-subtle-color-hover: ${(props) => props.theme.colors?.button?.subtle?.colorHover};
  --app-btn-subtle-bg-hover: ${(props) => props.theme.colors?.button?.subtle?.backgroundHover};
  --app-input-bg: ${(props) => props.theme.colors?.input?.background};
  --app-input-bg-hover: ${(props) => props.theme.colors?.input?.backgroundHover};
  --app-input-bg-active: ${(props) => props.theme.colors?.input?.backgroundActive};
  --app-input-color: ${(props) => props.theme.colors?.input?.color};
  --app-input-radius: ${(props) => props.theme.other?.input?.borderRadius};
  --app-nav-color: ${(props) => props.theme.colors?.nav?.color};
  --app-popover-bg: ${(props) => props.theme.colors?.popover?.background};
  --app-popover-color: ${(props) => props.theme.colors?.popover?.color};
  --app-tooltip-bg: ${(props) => props.theme.colors?.tooltip?.background};
  --app-tooltip-color: ${(props) => props.theme.colors?.tooltip?.color};
  --app-tooltip-border: ${(props) => props.theme.other?.tooltip?.border};
  --app-tooltip-radius: ${(props) => props.theme.other?.tooltip?.borderRadius};
  --app-context-bg: ${(props) => props.theme.colors?.contextMenu?.background};
  --app-context-bg-hover: ${(props) => props.theme.colors?.contextMenu?.backgroundHover};
  --app-context-color: ${(props) => props.theme.colors?.contextMenu?.color};
  --app-context-color-disabled: ${(props) => props.theme.colors?.contextMenu?.colorDisabled};
  --app-tag-bg: ${(props) => props.theme.colors?.tag?.background};
  --app-tag-color: ${(props) => props.theme.colors?.tag?.text};
  --app-tag-radius: ${(props) => props.theme.other?.tag?.borderRadius};
  --app-slider-bg: ${(props) => props.theme.colors?.slider?.background};
  --app-slider-progress: ${(props) => props.theme.colors?.slider?.progressBar};
  --app-selected-row: ${(props) => props.theme.colors?.table?.selectedRow};
  --app-table-header-bg: ${(props) =>
    props.theme.type === 'light' ? props.theme.colors?.layout?.sideBar?.background : 'transparent'};
  --app-card-overlay-bg: ${(props) => props.theme.colors?.card?.overlayButton?.background};
  --app-card-overlay-bg-hover: ${(props) =>
    props.theme.colors?.card?.overlayButton?.backgroundHover};
  --app-card-overlay-color: ${(props) => props.theme.colors?.card?.overlayButton?.color};
  --app-card-overlay-color-hover: ${(props) => props.theme.colors?.card?.overlayButton?.colorHover};
  --app-card-overlay-opacity: ${(props) => props.theme.colors?.card?.overlayButton?.opacity};
  --app-card-border: ${(props) => props.theme.other?.card?.border};
  --app-card-hover-transform: ${(props) => props.theme.other?.card?.hover?.transform};
  --app-card-hover-transition: ${(props) => props.theme.other?.card?.hover?.transition};
  --app-card-hover-filter: ${(props) => props.theme.other?.card?.hover?.filter};
  --app-card-img-top: ${(props) => props.theme.other?.card?.image?.borderTop};
  --app-card-img-right: ${(props) => props.theme.other?.card?.image?.borderRight};
  --app-card-img-bottom: ${(props) => props.theme.other?.card?.image?.borderBottom};
  --app-card-img-left: ${(props) => props.theme.other?.card?.image?.borderLeft};
  --app-card-img-radius: ${(props) => props.theme.other?.card?.image?.borderRadius};
  --app-card-info-top: ${(props) => props.theme.other?.card?.info?.borderTop};
  --app-card-info-right: ${(props) => props.theme.other?.card?.info?.borderRight};
  --app-card-info-bottom: ${(props) => props.theme.other?.card?.info?.borderBottom};
  --app-card-info-left: ${(props) => props.theme.other?.card?.info?.borderLeft};
  --app-card-info-radius: ${(props) => props.theme.other?.card?.info?.borderRadius};
  --app-cover-filter: ${(props) => props.theme.other?.coverArtFilter};
  --app-cover-radius: ${(props) => props.theme.other?.coverArtBorderRadius};
  --app-btn-radius: ${(props) => props.theme.other?.button?.borderRadius};
  --app-panel-radius: ${(props) => props.theme.other?.panel?.borderRadius};
  --app-font-page: ${(props) => props.theme.fonts?.size?.page};
  --app-font-panel: ${(props) => props.theme.fonts?.size?.panelTitle};
  --app-playerbar-height: 98px;
  --app-titlebar-height: 32px;
  /* type-conditional presentation vars (dark vs. light mode visual differences) */
  --app-blur-brightness: ${(props) => (props.theme.type === 'dark' ? '0.3' : '0.9')};
  --app-blurred-bg-img: ${(props) => (props.theme.type === 'light' ? '#f0f0f2' : '#0b0908')};
  --app-blurred-bg-no-img: ${(props) => (props.theme.type === 'light' ? '#e8e8eb' : '#00395A')};
  --app-gradient-alpha: ${(props) => (props.theme.type === 'dark' ? '0.2' : '0.15')};
  /* ── RSuite variable overrides (forward to app vars where applicable) ── */
  --rs-input-bg: var(--app-input-bg);
  --rs-input-disabled-bg: var(--app-input-bg-hover);
  --rs-table-header-bg: var(--app-table-header-bg);
  --rs-checkbox-border: #6a6f76;
  --rs-radio-border: #6a6f76;
  --rs-checkbox-checked-bg: var(--app-primary);
  --rs-radio-checked-bg: var(--app-primary);
  /* ── element styles (consume the variables defined above) ── */
  background: var(--app-bg);
  height: 100vh;
  color: var(--app-text);
  font-size: var(--app-font-page) !important;
`;

interface ContainerProps {
  id: string;
  expanded: boolean;
  children: React.ReactNode;
}

const StyledContainer = ({ id, expanded, children, ...props }: ContainerProps) => (
  <Container {...props}>{children}</Container>
);

export const MainContainer = styled(StyledContainer)<{ $titleBar: string; $sidebarwidth: string }>`
  padding-left: ${(props) => (props.expanded ? props.$sidebarwidth : '56px')};
  /* Height accounts for titlebar (32px) + player bar (98px) so the flex
     container never needs to shrink RootFooter. position:relative on a
     flex item with flex-shrink:0 triggers a Chromium bug that shrinks it. */
  height: ${(props) => (props.$titleBar === 'native' ? 'calc(100% - 98px)' : 'calc(100% - 130px)')};
  margin-top: ${(props) => (props.$titleBar === 'native' ? '0px' : '32px')};
  overflow-y: auto;
`;

export const RootFooter = styled(Footer)`
  height: 98px;
`;

// Titlebar.tsx
// Subtract 2px from width if you add window border
export const TitleHeader = styled.header`
  z-index: 1;
  display: block;
  position: fixed;
  height: 32px;
  width: ${(props) => (props.className?.includes('maximized') ? '100%' : 'calc(100%)')};
  background: var(--app-titlebar-bg);
  padding: 4px;
  color: var(--app-titlebar-color);
`;

export const DragRegion = styled.div`
  width: 100%;
  height: 100%;
  -webkit-app-region: drag;

  > #window-title {
    margin-left: 12px;
  }
`;

export const WindowControl = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 46px);
  position: absolute;
  top: 0;
  right: 8px;
  height: 100%;

  -webkit-app-region: no-drag;
`;

export const MacControl = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 20px);
  position: absolute;
  top: 0;
  left: 4px;
  height: 100%;

  -webkit-app-region: no-drag;
`;

export const MacControlButton = styled.div<{
  $minButton?: boolean;
  $maxButton?: boolean;
  $restoreButton?: boolean;
}>`
  user-select: none;
  grid-row: 1 / span 1;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  grid-column: ${(props) =>
    props.$minButton ? 2 : props.$maxButton || props.$restoreButton ? 3 : 1};

  img {
    width: 18px;
    height: 18px;
  }
`;

export const WindowControlButton = styled.div<{
  $minButton?: boolean;
  $maxButton?: boolean;
  $restoreButton?: boolean;
}>`
  user-select: none;
  grid-row: 1 / span 1;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  grid-column: ${(props) =>
    props.$minButton ? 1 : props.$maxButton || props.$restoreButton ? 2 : 3};

  &:hover {
    background: rgba(128, 128, 128, 0.2);
  }

  &:active {
    background: rgba(128, 128, 128, 0.3);
  }
`;

// GenericPage.tsx
export const PageContainer = styled(Container)`
  height: 100%;
  overflow-x: hidden;
`;

export const PageHeader = styled(Header)<{ padding?: string }>`
  padding: ${(props) => (props.padding ? props.padding : '10px 20px 0px 20px')};
  z-index: 1;
`;

export const PageContent = styled(Content)<{ padding?: string; $zIndex?: number }>`
  position: relative;
  padding: ${(props) => (props.padding ? props.padding : '10px')};
  z-index: ${(props) => props.$zIndex};
`;

// Sidebar.tsx
// Add 1 to top if you add window border
export const FixedSidebar = styled(Sidebar)<{ $titleBar: string }>`
  background: var(--app-sidebar-bg) !important;
  position: fixed;
  top: ${(props) => (props.$titleBar === 'native' ? '0px' : '32px')};
  z-index: 1;
  height: ${(props) => (props.$titleBar === 'native' ? 'calc(100% - 98px)' : 'calc(100% - 130px)')};
  overflow-y: auto;
  overflow-x: hidden;
  user-select: none;

  &::-webkit-scrollbar {
    display: none;
  }

  .rs-sidenav-body {
    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

export const SidebarNavItem = styled(Nav.Item)<{ $show: boolean }>`
  user-select: none;
  display: ${(props) => (props.$show ? undefined : 'none')};

  /* font-size and width: rsuite's direct-child selector (.rs-sidenav-nav>.rs-sidenav-item)
     doesn't reach our items (wrapped in a div), so apply explicitly. */
  font-size: 14px !important;
  width: 100% !important;
  border-radius: 0 !important;

  /* Icon sizing: rsuite 4 used height:14px on sidenav icons.
     In rsuite 6 the icon gets class rs-sidenav-item-icon. */
  .rs-sidenav-item-icon {
    width: 14px !important;
    height: 14px !important;
    flex-shrink: 0;
  }

  /* rsuite 6: SidenavItem renders as <a> (SafeAnchor) directly — apply color to self.
     Keep a{} selector as well for any nested anchors / rsuite 4 compatibility. */
  color: var(--app-sidebar-btn) !important;

  a {
    color: var(--app-sidebar-btn) !important;
  }

  &:hover,
  &:focus-visible {
    color: var(--app-sidebar-btn-hover) !important;
    background-color: rgba(128, 128, 128, 0.15) !important;
  }

  a:hover,
  a:focus-visible {
    color: var(--app-sidebar-btn-hover) !important;
  }

  &[data-active='true'] {
    color: var(--app-sidebar-btn-hover) !important;
    border-left: 3px solid var(--app-primary);
    font-weight: 600;
  }
`;

export const CoverArtWrapper = styled.div<{ $link?: boolean; $size: number; $card?: boolean }>`
  display: inline-block;
  filter: var(--app-cover-filter);
  cursor: ${(props) => (props.$link ? 'pointer' : undefined)};
  text-align: center;
  height: ${(props) => props.$size}px;
  width: ${(props) => props.$size}px;
  border-radius: var(--app-cover-radius);
  background: transparent;
  vertical-align: top;
  overflow: ${(props) => (props.$card ? 'visible' : 'hidden')};

  &:focus-visible {
    outline: 2px var(--app-primary) solid;
  }

  img {
    vertical-align: unset !important;
  }
`;

export const PageHeaderTitle = styled.h1`
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-size: 4vw;
  line-height: 1.2;
  /* Remove browser default h1 margins so the title sits flush at the top
     and doesn't push subtitle content down. */
  margin: 0;
  /* padding-bottom gives descenders (g, y, p) room so overflow:hidden doesn't clip them */
  padding-bottom: 4px;

  @media screen and (min-width: 1000px) {
    font-size: 40px;
  }
`;

export const PageHeaderWrapper = styled.div<{
  $hasImage: boolean;
  $imageHeight: number;
  $isDark?: boolean;
}>`
  display: ${(props) => (props.$hasImage ? 'inline-flex' : undefined)};
  flex-direction: column;
  min-height: ${(props) => (props.$hasImage ? `${props.$imageHeight}px` : 'auto')};
  width: ${(props) => (props.$hasImage ? `calc(100% - ${props.$imageHeight + 15}px)` : '100%')};
  margin-left: ${(props) => (props.$hasImage ? '15px' : '0px')};
  vertical-align: top;
  color: var(--app-text);
  user-select: none;
`;

export const PageHeaderSubtitleWrapper = styled.span`
  width: 80%;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  flex: 1;
`;

export const PageHeaderSubtitleDataLine = styled.div<{
  $top?: boolean;
  $overflow?: boolean;
  $wrap?: boolean;
}>`
  margin-top: ${(props) => (props.$top ? '0px' : '7px')};
  white-space: ${(props) => (props.$wrap ? 'normal' : 'nowrap')};
  overflow: ${(props) => (props.$overflow ? 'visible' : 'auto')};

  &::-webkit-scrollbar {
    height: 4px;
  }

  scroll-behavior: smooth;
`;

export const FlatBackground = styled.div<{
  $expanded: boolean;
  $color: string;
  $titleBar: string;
  $sidebarwidth: string;
}>`
  background: ${(props) => props.$color};
  top: ${(props) => (props.$titleBar === 'native' ? '0px' : '32px')};
  left: ${(props) => (props.$expanded ? props.$sidebarwidth : '56px')};
  height: 200px;
  position: absolute;
  width: ${(props) =>
    props.$expanded ? `calc(100% - ${props.$sidebarwidth})` : 'calc(100% - 56px)'};
  user-select: none;
  pointer-events: none;
`;

export const BlurredBackgroundWrapper = styled.div<{
  $expanded: boolean;
  $hasImage: boolean;
  $titleBar: string;
  $sidebarwidth: string;
}>`
  clip: rect(0, auto, auto, 0);
  -webkit-clip-path: inset(0 0);
  clip-path: inset(0 0);
  position: absolute;
  left: ${(props) => (props.$expanded ? props.$sidebarwidth : '56px')};
  width: ${(props) =>
    props.$expanded ? `calc(100% - ${props.$sidebarwidth})` : 'calc(100% - 56px)'};
  top: ${(props) => (props.$titleBar === 'native' ? '0px' : '32px')};
  z-index: 1;
  background: ${(props) =>
    props.$hasImage ? 'var(--app-blurred-bg-img)' : 'var(--app-blurred-bg-no-img)'};
  filter: ${(props) => (props.$hasImage ? 'none' : 'brightness(0.3)')};
`;

export const BlurredBackground = styled.img<{ $expanded: boolean }>`
  background-position: center 30%;
  background-size: cover;
  filter: blur(10px) brightness(var(--app-blur-brightness));

  outline: none !important;
  border: none !important;
  margin: 0px !important;
  padding: 0px !important;
  width: 100%;
  height: 212px;
  z-index: -1;
  user-select: none;
  pointer-events: none;
  display: block;
`;

export const GradientBackground = styled.div<{
  $expanded: boolean;
  $color: string;
  $titleBar: string;
  $sidebarwidth: string;
}>`
  background: ${(props) =>
    `linear-gradient(0deg, transparent 10%, ${props.$color.replace(',1)', ', var(--app-gradient-alpha))')} 100%)`};
  top: ${(props) => (props.$titleBar === 'native' ? '0px' : '32px')};
  left: ${(props) => (props.$expanded ? props.$sidebarwidth : '56px')};
  height: calc(100% - var(--app-playerbar-height) - var(--app-titlebar-height));
  position: absolute;
  width: ${(props) =>
    props.$expanded ? `calc(100% - ${props.$sidebarwidth})` : 'calc(100% - 56px)'};
  z-index: 1;
  user-select: none;
  pointer-events: none;
`;

export const CustomImageGridWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 92px);
  grid-template-rows: repeat(2, 92px);
  grid-column-gap: 0px;
  grid-row-gap: 0px;
`;

export const CustomImageGrid = styled.div<{ $gridArea: string }>`
  grid-area: ${(props) => props.$gridArea};
`;

export const SidebarDragContainer = styled.div<{ $resizing: boolean }>`
  position: absolute;
  right: 0;
  width: 3px;
  height: 100%;
  z-index: 1;

  background-color: ${(props) => props.$resizing && 'var(--app-primary)'};

  &:hover {
    cursor: w-resize !important;
  }
`;

export const SidebarCoverArtContainer = styled.div<{ height: string }>`
  position: absolute;
  bottom: 0;
  height: ${(props) => props.height};
  width: 100%;
  z-index: 100;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.2);

  img {
    max-height: ${(props) => props.height};
    max-width: 100%;
    height: auto;
    cursor: pointer;
  }

  .rs-btn {
    display: none;
  }

  &:hover {
    .rs-btn {
      display: block;
      position: absolute;
      bottom: 0;
      left: 0;
      z-index: 99;
      border-radius: 0px !important;
    }
  }
`;

export const PlaylistDivider = styled(Divider)`
  margin: 10px 0 !important;
`;
