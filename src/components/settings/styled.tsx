import styled from 'styled-components';
import { Panel } from 'rsuite';

export const ConfigPanelTitle = styled.div`
  font-size: var(--app-font-panel);
  min-width: 500px;
  max-width: 1200px;
  margin: 15px auto 15px auto;
`;

export const ConfigPanel = styled(Panel)<{ $noBackground: boolean }>`
  color: var(--app-text);
  min-width: 500px;
  max-width: 1200px;
  margin: ${(props) => (props.collapsible ? '0' : '15px auto 15px auto')};
  padding: 15px;
  overflow: visible;

  background: ${(props) =>
    props.$noBackground || !props.bordered ? 'none' : 'rgba(0, 0, 0, 0.1)'};
  border-radius: 15px;

  .rs-panel-header {
    font-size: var(--app-font-panel);
  }

  .rs-panel-collapsible > .rs-panel-header::before {
    top: 0px !important;
  }
`;

export const MockFooter = styled.div`
  width: 100%;
  height: 100%;
  background: var(--app-playerbar-bg);
  border-top: var(--app-playerbar-border-top, 1px solid #48545c);
`;

export const LoginPanel = styled(Panel)`
  color: var(--app-text);
  padding: 20px;
  min-width: 300px;
  max-width: 300px;
  margin: 5px auto 5px auto;

  .rs-form-stack {
    gap: calc(var(--rs-spacing) * 2);
  }
`;

export const ConfigOptionName = styled.div`
  font-size: 14px;
  font-weight: 500;
`;

export const ConfigOptionDescription = styled.div`
  font-size: 13px;
`;

export const ConfigOptionSection = styled.div`
  padding: 15px 0 15px 0;
`;

export const ConfigOptionInput = styled.div`
  align-items: center;
`;
