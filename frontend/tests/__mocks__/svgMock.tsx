export default function SvgMock(props: any) {
  return (
    <svg data-testid={props?.['data-testid'] || 'svg-icon-mock'} className={props?.className} onClick={props?.onClick}>
      mock-svg
    </svg>
  );
}
