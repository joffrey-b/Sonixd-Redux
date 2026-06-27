import React from 'react';
import {
  Button,
  InputGroup,
  InputNumber,
  Input,
  Checkbox,
  IconButton,
  Radio,
  Nav,
  Rate,
  Slider,
  InputPicker,
  Popover,
  Panel,
  TagPicker,
  Tag,
  CheckPicker,
  Toggle,
  Pagination,
} from 'rsuite';
import styled from 'styled-components';
import TagLink from './TagLink';

export const HeaderButton = styled(Button)`
  margin-left: 5px;
  margin-right: 5px;
`;

export const StyledButton = styled(Button)<{ $width?: number; $circle: boolean }>`
  border-radius: ${(props) => (props.$circle ? '100px' : 'var(--app-btn-radius)')} !important;
  /* RSuite Button sets height but not width, so icon-only circle buttons render as ovals.
     aspect-ratio forces width = height to produce a true circle. */
  ${(props) => props.$circle && 'aspect-ratio: 1; justify-content: center;'}
  background: ${(props) =>
    props.appearance === 'primary'
      ? 'var(--app-primary)'
      : props.appearance === 'subtle' || props.appearance === 'link'
        ? undefined
        : 'var(--app-btn-default-bg)'} !important;
  color: ${(props) =>
    props.loading
      ? 'transparent'
      : props.appearance === 'primary'
        ? 'var(--app-btn-primary-color)'
        : props.appearance === 'subtle'
          ? 'var(--app-btn-subtle-color)'
          : props.appearance === 'link'
            ? undefined
            : 'var(--app-btn-default-color)'} !important;

  filter: ${(props) => (props.disabled ? 'brightness(0.65)' : 'none')};
  transition: 0s;
  width: ${(props) => props.$width && `${props.$width}px`};

  &:hover {
    color: ${(props) =>
      props.appearance === 'primary'
        ? 'var(--app-btn-primary-color-hover)'
        : props.appearance !== 'subtle'
          ? 'var(--app-btn-default-color-hover)'
          : 'var(--app-btn-subtle-color-hover)'} !important;

    background: ${(props) =>
      props.appearance === 'primary'
        ? 'var(--app-btn-primary-bg-hover)'
        : props.appearance === 'subtle'
          ? 'var(--app-btn-subtle-bg-hover)'
          : props.appearance === 'link'
            ? undefined
            : 'var(--app-btn-default-bg-hover)'} !important;
  }

  &:focus {
    color: ${(props) =>
      props.loading
        ? 'transparent'
        : props.appearance === 'primary'
          ? 'var(--app-btn-primary-color)'
          : props.appearance === 'subtle'
            ? 'var(--app-btn-subtle-color)'
            : props.appearance === 'link'
              ? undefined
              : 'var(--app-btn-default-color)'};
    background: ${(props) => props.appearance === 'subtle' && 'unset'} !important;
  }

  &:focus-visible {
    filter: brightness(0.8);
  }
`;

export const StyledInputGroup = styled(InputGroup)`
  border-radius: var(--app-input-radius);
  --rs-focus-ring-color: transparent;

  /* inside=true groups (search bars): the group IS the visual container, keep its border */

  /* non-inside groups (track filter + Add, cache path + Clear, etc.):
     remove the outer border so only the inner StyledInput's own border is visible.
     rsuite sets data-inside=true for inside=true groups. */
  &:not([data-inside='true']) {
    border: none !important;
    --rs-input-focus-border: transparent;
  }
`;

export const StyledInputGroupButton = styled(InputGroup.Button)<{ $height?: number }>`
  height: ${(props) => props.$height && `${props.$height}px`} !important;
  background: ${(props) =>
    props.appearance === 'primary'
      ? 'var(--app-primary)'
      : props.appearance === 'subtle' || props.appearance === 'link'
        ? undefined
        : 'var(--app-btn-default-bg)'} !important;
  color: ${(props) =>
    props.appearance === 'primary'
      ? 'var(--app-btn-primary-color)'
      : props.appearance === 'subtle'
        ? 'var(--app-btn-subtle-color)'
        : props.appearance === 'link'
          ? 'none'
          : 'var(--app-btn-default-color)'} !important;

  &:active,
  &:focus,
  &:hover {
    background: ${(props) =>
      props.appearance === 'primary'
        ? 'var(--app-btn-primary-bg-hover)'
        : props.appearance === 'subtle' || props.appearance === 'link'
          ? `none !important`
          : `var(--app-btn-default-bg-hover) !important`};
  }

  &:hover {
    color: ${(props) =>
      props.appearance === 'primary'
        ? 'var(--app-btn-primary-color-hover)'
        : props.appearance !== 'subtle'
          ? 'var(--app-btn-default-color-hover)'
          : 'var(--app-btn-subtle-color-hover) !important'};
  }
  border-radius: var(--app-input-radius) !important;
  border-bottom-right-radius: var(--app-input-radius) !important;
  border-top-right-radius: var(--app-input-radius) !important;
`;

export const StyledInputNumber = styled(InputNumber)<{ $width: number }>`
  border: 1px var(--rs-border-secondary) solid !important;
  border-radius: var(--app-input-radius) !important;
  box-shadow: none !important;
  outline: none !important;

  input {
    box-shadow: none !important;
    outline: none !important;
  }

  .rs-input {
    border-radius: var(--app-input-radius) !important;
    box-shadow: none !important;
  }

  .rs-input-group,
  .rs-input-group:focus-within,
  .rs-input-group:hover {
    box-shadow: none !important;
    outline: none !important;
  }

  &:not([data-disabled='true']):hover,
  &:not([data-disabled='true']):active,
  &:not([data-disabled='true']):focus,
  &:not([data-disabled='true']):focus-within {
    border-color: var(--app-primary) !important;
    box-shadow: none !important;
    outline: none !important;
  }

  /* !important needed: rsuite 6 sets .rs-number-input.rs-input-group{width:auto}
     at specificity (0,2,0) which overrides our styled class at (0,1,0) */
  width: ${(props) => `${props.$width}px`} !important;

  /* Match StyledInputPicker's 36px height (line-height 20px + padding 8px × 2) */
  height: 36px !important;
  .rs-input {
    height: 100% !important;
  }
`;

export const StyledInput = styled(Input)<{ $width?: number; $opacity?: number }>`
  border: 1px var(--rs-border-secondary) solid !important;
  border-radius: var(--app-input-radius) !important;

  color: var(--app-input-color) !important;
  width: ${(props) => props.$width && `${props.$width}px`};
  border-radius: var(--app-input-radius);
  opacity: ${(props) => props.$opacity};

  &:not(:disabled):hover,
  &:not(:disabled):focus,
  &:not(:disabled):focus-within {
    border-color: var(--app-primary) !important;
  }
`;

export const StyledCheckbox = styled(Checkbox)`
  user-select: none;
  display: block !important;
  margin-bottom: 4px;
  /* Hide rsuite 6's ripple animation */
  .rs-checkbox-control::before {
    display: none !important;
  }
`;

export const StyledToggle = styled(Toggle)`
  &[data-checked='true'] .rs-toggle-track {
    background-color: var(--app-primary) !important;
  }

  /* Disabled checked: use native --rs-toggle-checked-disabled-bg instead of primary */
  &[data-checked='true'][data-disabled='true'] .rs-toggle-track {
    background-color: var(--rs-toggle-checked-disabled-bg) !important;
  }

  .rs-toggle-inner {
    color: var(--app-btn-primary-color);
  }

  &:focus-visible .rs-toggle-track {
    outline: none !important;
    box-shadow: none !important;
  }
`;

export const StyledRadio = styled(Radio)`
  user-select: none;
  /* Checked fill colour handled natively via --rs-radio-checked-bg on RootContainer.
     Hide rsuite 6's ripple animation same as StyledCheckbox. */
  .rs-radio-control::before {
    display: none !important;
  }
`;

export const StyledIconButton = styled(IconButton)`
  border-radius: var(--app-btn-radius);
  background: ${(props) =>
    props.appearance === 'primary'
      ? 'var(--app-primary)'
      : props.appearance === 'subtle' || props.appearance === 'link'
        ? undefined
        : 'var(--app-btn-default-bg)'} !important;
  color: ${(props) =>
    props.loading
      ? 'transparent'
      : props.appearance === 'primary'
        ? 'var(--app-btn-primary-color)'
        : props.appearance === 'subtle'
          ? 'var(--app-btn-subtle-color)'
          : props.appearance === 'link'
            ? undefined
            : 'var(--app-btn-default-color)'} !important;

  filter: ${(props) => (props.disabled ? 'brightness(0.65)' : 'none')};
  transition: 0s;
  width: ${(props) => `${props.width}px`};

  &:active,
  &:focus,
  &:hover {
    color: ${(props) =>
      props.appearance === 'primary'
        ? 'var(--app-btn-primary-color-hover)'
        : props.appearance !== 'subtle'
          ? 'var(--app-btn-default-color-hover)'
          : 'var(--app-btn-subtle-color-hover)'};

    background: ${(props) =>
      props.appearance === 'primary'
        ? 'var(--app-btn-primary-bg-hover)'
        : props.appearance === 'subtle'
          ? 'var(--app-btn-subtle-bg-hover)'
          : props.appearance === 'link'
            ? undefined
            : 'var(--app-btn-default-bg-hover)'} !important;
  }

  &:focus-visible {
    filter: brightness(0.8);
    background: ${(props) =>
      props.appearance === 'subtle' ? 'rgba(0, 0, 0, .3)' : undefined} !important;
  }
`;

export const StyledNavItem = styled(Nav.Item)`
  /* rsuite 6: NavItem renders as <a> directly (no li > a), apply styles to element itself */
  text-align: center;
  border-radius: 6px !important;
  color: var(--app-nav-color) !important;

  &:hover {
    background: rgba(128, 128, 128, 0.15) !important;
  }

  &[data-active='true'] {
    color: var(--app-primary) !important;
  }

  &:focus-visible {
    background: rgba(0, 0, 0, 0.3) !important;
  }
`;

export const StyledIconToggle = styled.span<{ $active: string }>`
  cursor: pointer;
  color: ${(props) => (props.$active === 'true' ? 'var(--app-primary)' : 'var(--app-text)')};
  font-size: 1.2em;
  display: inline-flex;
  align-items: center;

  &:focus-visible {
    outline: none;
    filter: brightness(0.7);
  }
`;

export const StyledRate = styled(Rate)`
  color: var(--app-primary);
`;

export const StyledSlider = styled(Slider)``;

export const StyledInputPickerContainer = styled.div`
  position: relative;

  .rs-picker-popup {
    background: var(--app-input-bg);
    border-radius: var(--app-input-radius);
  }

  .rs-picker-select-menu-item-active {
    background: var(--app-input-bg-active);

    &:hover {
      background: var(--app-input-bg-active);
    }
  }

  .rs-picker-select-menu-item-disabled {
    opacity: 0.5 !important;
  }

  .rs-picker-select-menu-item-focus {
    color: var(--app-input-color);
    background: var(--app-input-bg-hover);
  }

  .rs-picker-select-menu-item,
  .rs-picker-select-menu-group-title {
    color: var(--app-input-color);

    &:hover {
      color: var(--app-input-color);
      &:hover {
        background: var(--app-input-bg-hover);
      }
    }
  }

  .rs-picker-select-menu-group-title {
    color: var(--app-input-color);

    &:hover {
      color: var(--app-input-color);
    }
  }

  .rs-check-item {
    background: var(--app-input-bg) !important;
    border-radius: var(--app-input-radius);

    &:hover {
      color: var(--app-input-color);
      background-color: var(--app-input-bg-hover) !important;
    }
  }

  .rs-check-item-focus {
    color: var(--app-input-color);
    background: var(--app-input-bg-active) !important;
  }

  .rs-checkbox-checked {
    .rs-checkbox-checker {
      span {
        &:before {
          border: 1px solid var(--app-primary);
        }
        span {
          &:before {
            background-color: var(--app-primary) !important;
          }
          &:after {
            border: transparent !important;
          }
        }
      }
    }
  }

  .rs-picker-search-bar-input {
    background-color: var(--app-input-bg) !important;
    border-color: #383838 !important;
  }
`;

const StyledInputPickerBase = styled(InputPicker)<{ width?: number }>`
  width: ${(props) => (props.width ? `${props.width}px` : undefined)};
  /* Border on the root (matches StyledInput / StyledInputNumber visual pattern) */
  border: 1px var(--rs-border-secondary) solid !important;
  border-radius: var(--app-input-radius) !important;
  background: var(--app-input-bg) !important;
  vertical-align: top !important;
  --rs-focus-ring-color: transparent;

  /* Toggle has no separate border — the root border is the visual boundary */
  .rs-picker-toggle {
    box-sizing: border-box;
    height: 32px;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  /* Hover/open: change root border to primary, matching text input hover */
  &:not([data-disabled='true']):hover,
  &[data-focus='true'] {
    border-color: var(--app-primary) !important;
  }

  .rs-picker-toggle-value {
    color: var(--app-text) !important;
  }
`;

// rsuite 4 defaulted InputPicker to searchable=false; rsuite 6 defaults to true.
// React 19 removed defaultProps for function components so we use a wrapper.
// forwardRef is required because Whisper (rsuite) uses cloneElement+ref on its child.
const StyledInputPickerInner = React.forwardRef<
  unknown,
  React.ComponentPropsWithoutRef<typeof StyledInputPickerBase>
>(({ searchable = false, ...props }, ref) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- styled-components createElement requires any cast; safe as this is a thin prop-forwarding wrapper
  React.createElement(StyledInputPickerBase as any, { searchable, ref, ...props })
);
StyledInputPickerInner.displayName = 'StyledInputPicker';
export const StyledInputPicker = StyledInputPickerInner as unknown as typeof StyledInputPickerBase;

export const ContextMenuWindow = styled.div<{
  $yPos: number;
  $xPos: number;
  $numOfButtons: number;
  $numOfDividers: number;
  $minWidth: number;
  $maxWidth: number;
  $hasTitle: boolean;
}>`
  background: var(--app-context-bg);
  position: absolute;
  top: ${(props) => `${props.$yPos}px`};
  left: ${(props) => `${props.$xPos}px`};
  height: ${(props) =>
    `${props.$numOfButtons * 30 + props.$numOfDividers * 1.5 + (props.$hasTitle ? 16 : 0)}px`};
  min-width: ${(props) => `${props.$minWidth}px`};
  max-width: ${(props) => `${props.$maxWidth}px`};
  margin: 0px;
  white-space: normal;
  overflow: hidden;
  overflow-x: hidden;
  font-size: smaller;
  border: 1px #3c4043 solid;
  z-index: 2000;
`;

export const StyledContextMenuButton = styled(Button)`
  color: ${(props) =>
    props.disabled ? 'var(--app-context-color-disabled)' : 'var(--app-context-color)'} !important;
  transition: none;
  &:hover,
  &:active,
  &:focus {
    color: var(--app-context-color);
    background: var(--app-context-bg-hover);
  }

  text-align: left;
  margin: 0px !important;
  border-radius: 0px !important;
`;

export const ContextMenuDivider = styled.hr`
  margin: 0px;
`;

export const ContextMenuTitle = styled.div`
  color: var(--app-text);
  margin: 5px 0 5px 5px;
  user-select: none;
`;

export const ContextMenuPopover = styled(Popover)`
  color: var(--app-context-color) !important;
  background: var(--app-context-bg);
  position: absolute;
  border: 1px #3c4043 solid;
  z-index: 2000;
`;

export const StyledPopover = styled(Popover)<{ $width?: string; $font?: string }>`
  color: var(--app-popover-color);
  background: var(--app-popover-bg);
  border: 1px #3c4043 solid;
  position: absolute;
  z-index: 1000;
  width: ${(props) => props.$width};
  font-family: ${(props) => props.$font};
`;

export const SectionTitleWrapper = styled.div<{ $maxWidth?: string }>`
  margin-left: 10px;
  margin-bottom: 10px;
  max-width: ${(props) => props.$maxWidth};
`;

export const SectionTitle = styled.a`
  user-select: none;
  vertical-align: middle;
  font-size: var(--app-font-panel);
  color: var(--app-text);
  cursor: ${(props) => (props.onClick ? 'pointer' : 'default')};

  &:hover {
    text-decoration: none;
    color: ${(props) => (!props.onClick ? 'var(--app-text)' : 'var(--app-primary)')};
  }

  &:active,
  &:focus {
    text-decoration: none;
    color: ${(props) => (!props.onClick ? 'var(--app-text)' : 'var(--app-primary)')};
  }
`;

export const LinkWrapper = styled.span<{ $maxWidth: string }>`
  display: inline-block;
  max-width: ${(props) => props.$maxWidth};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: bottom;
`;

export const StyledLink = styled.a<{ $underline?: boolean; $color?: string }>`
  color: ${(props) => props?.$color || 'var(--app-text)'};
  cursor: pointer;
  text-decoration: ${(props) => (props.$underline ? 'underline' : undefined)};
  font-weight: bold;

  &:hover {
    color: ${(props) => props?.$color || 'var(--app-text)'};
  }

  &:focus-visible {
    text-decoration: none;
  }
`;

export const StyledPanel = styled(Panel)<{ $maxWidth?: string }>`
  color: var(--app-text);
  border-radius: var(--app-panel-radius);
  max-width: ${(props) => props.$maxWidth};
  margin-bottom: 15px;

  .rs-panel-header {
    user-select: none;
    margin-left: 10px;
    font-size: var(--app-font-panel);

    .rs-panel-title {
      align-items: flex-end;
    }
  }
`;

export const StyledTagPicker = styled(TagPicker)`
  border: 1px var(--rs-border-secondary) solid !important;
  border-radius: var(--app-input-radius) !important;

  &:hover,
  &:active,
  &:focus {
    border-color: var(--app-primary) !important;
  }

  .rs-picker-input {
    &:hover {
      border-color: var(--app-primary);
    }
  }

  .rs-tag {
    color: var(--app-tag-color);
    background: var(--app-tag-bg);
    border-radius: var(--app-tag-radius);
  }
`;

export const StyledCheckPicker = styled(CheckPicker)<{ $width?: number }>`
  /* rsuite 6: CheckPicker root div has no border; put border on toggle like StyledInputPicker */
  border: none !important;
  background: transparent !important;
  width: ${(props) => (props.$width ? `${props.$width}px` : undefined)};

  &:not([data-disabled='true']):hover,
  &:not([data-disabled='true']):active,
  &:not([data-disabled='true']):focus,
  &[data-focus='true'] {
    .rs-picker-toggle {
      border-color: var(--app-primary) !important;
    }
  }

  .rs-picker-toggle:hover {
    background: var(--app-input-bg-hover) !important;
  }

  .rs-picker-toggle:active {
    background: var(--app-input-bg-active) !important;
  }

  .rs-picker-toggle {
    border: 1px var(--rs-border-secondary) solid !important;
    border-radius: var(--app-input-radius) !important;
    box-sizing: border-box;
    width: 100%;
  }

  .rs-picker-toggle {
    span {
      color: var(--app-text) !important;
    }
  }

  .rs-picker-value-count {
    background: var(--app-primary);
    color: var(--app-btn-primary-color) !important;
  }
`;

export const StyledTag = styled(Tag)`
  color: var(--app-tag-color) !important;
  background: var(--app-tag-bg);
  border-radius: var(--app-tag-radius);
  font-weight: 200;

  cursor: pointer;
`;

export const StyledTagLink = styled(TagLink)`
  color: var(--app-tag-color) !important;
  background: var(--app-tag-bg);
  border-radius: var(--app-tag-radius);

  max-width: 13rem;
  text-overflow: ellipsis;
  overflow: hidden;
  cursor: pointer;
`;

export const SecondaryTextWrapper = styled.span<{
  $subtitle?: string;
  $active?: boolean;
}>`
  color: ${(props) =>
    props.$subtitle === 'true' ? 'var(--app-text-secondary)' : 'var(--app-text)'};
`;

export const StyledPagination = styled(Pagination)`
  vertical-align: middle;
  /* rsuite 6: pagination buttons render as <button>, not <a> */
  .rs-pagination-btn {
    transition: none;
    &:hover {
      color: var(--app-btn-subtle-color-hover) !important;
      background-color: var(--app-btn-subtle-bg-hover) !important;
    }

    &:active {
      background-color: transparent !important;
    }
  }

  /* rsuite 6: active page button uses data-active attribute, not rs-pagination-btn-active class */
  .rs-pagination-btn[data-active='true'] {
    color: var(--app-primary) !important;
    background-color: transparent !important;
  }
`;
