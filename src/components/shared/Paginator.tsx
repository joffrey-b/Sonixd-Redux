import React from 'react';
import { ButtonGroup, ButtonToolbar, FlexboxGrid, Whisper } from 'rsuite';
import CaretRightIcon from '@rsuite/icons/legacy/CaretRight';
import Popup from './Popup';
import { SecondaryTextWrapper, StyledButton, StyledIconButton, StyledPagination } from './styled';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rest includes StyledPagination props (activePage, pages, onChangePage, bottom, etc.); forwarded directly without transformation
const Paginator = ({ startIndex, endIndex, handleGoToButton, children, ...rest }: any) => {
  return (
    <>
      <FlexboxGrid
        justify="space-between"
        style={{
          paddingLeft: '10px',
          paddingTop: '15px',
          width: rest.bottom && '100%',
          bottom: '0px',
          position: rest.bottom && 'absolute',
        }}
      >
        <FlexboxGrid.Item style={{ alignSelf: 'center' }}>
          {children}
          <SecondaryTextWrapper $subtitle="true">
            {startIndex && startIndex}
            {startIndex && endIndex && ` - ${endIndex}`}
          </SecondaryTextWrapper>
        </FlexboxGrid.Item>
        <FlexboxGrid.Item style={{ alignSelf: 'center', display: 'flex', alignItems: 'center' }}>
          <StyledPagination {...rest} />
          {handleGoToButton && (
            <Whisper
              enterable
              preventOverflow
              placement="autoVerticalEnd"
              trigger="click"
              speaker={
                <Popup>
                  <ButtonGroup>
                    <StyledButton
                      appearance="subtle"
                      onClick={() => {
                        const p =
                          rest.activePage + 5 < rest.pages ? rest.activePage + 5 : rest.pages;
                        if (p !== rest.activePage) handleGoToButton(p);
                      }}
                    >
                      +5
                    </StyledButton>
                    <StyledButton
                      appearance="subtle"
                      onClick={() => {
                        const p =
                          rest.activePage + 15 < rest.pages ? rest.activePage + 15 : rest.pages;
                        if (p !== rest.activePage) handleGoToButton(p);
                      }}
                    >
                      +15
                    </StyledButton>
                    <StyledButton
                      appearance="subtle"
                      onClick={() => {
                        const p =
                          rest.activePage + 50 < rest.pages ? rest.activePage + 50 : rest.pages;
                        if (p !== rest.activePage) handleGoToButton(p);
                      }}
                    >
                      +50
                    </StyledButton>
                  </ButtonGroup>
                  <ButtonToolbar>
                    <StyledButton
                      appearance="subtle"
                      onClick={() => {
                        const p = rest.activePage - 5 > 1 ? rest.activePage - 5 : 1;
                        if (p !== rest.activePage) handleGoToButton(p);
                      }}
                    >
                      -5
                    </StyledButton>
                    <StyledButton
                      appearance="subtle"
                      onClick={() => {
                        const p = rest.activePage - 15 > 1 ? rest.activePage - 15 : 1;
                        if (p !== rest.activePage) handleGoToButton(p);
                      }}
                    >
                      -15
                    </StyledButton>
                    <StyledButton
                      appearance="subtle"
                      onClick={() => {
                        const p = rest.activePage - 50 > 1 ? rest.activePage - 50 : 1;
                        if (p !== rest.activePage) handleGoToButton(p);
                      }}
                    >
                      -50
                    </StyledButton>
                  </ButtonToolbar>
                </Popup>
              }
            >
              <StyledIconButton size="sm" appearance="subtle" icon={<CaretRightIcon />} />
            </Whisper>
          )}
        </FlexboxGrid.Item>
      </FlexboxGrid>
    </>
  );
};

export default Paginator;
