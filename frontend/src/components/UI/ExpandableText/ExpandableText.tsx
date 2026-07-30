import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';
import styles from './ExpandableText.module.scss';

interface Props {
  text: string;
  readMoreLabel?: string;
  readLessLabel?: string;
  className?: string;
  textClassname?: string;
}

export function ExpandableText({ text, readMoreLabel = 'Read more', readLessLabel = 'Read less', className, textClassname }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textParagraphRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = textParagraphRef.current;
    // scrollHeight = total content height
    // clientHeight = height allowed by CSS (2 lines)
    if (element) {
      setIsTruncated(element.scrollHeight > element.clientHeight);
    }
  }, [text]);

  return (
    <div className={classNames(styles.ExpandableText, className)}>
      <p ref={textParagraphRef} className={classNames(styles.Description, { [styles.Expanded]: isExpanded }, textClassname)}>
        {text}
      </p>
      {(isTruncated || isExpanded) && (
        <button type="button" className={styles.ReadMoreButton} onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? readLessLabel : readMoreLabel}
        </button>
      )}
    </div>
  );
}
