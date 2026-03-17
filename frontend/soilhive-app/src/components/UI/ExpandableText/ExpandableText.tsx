import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';
import styles from './ExpandableText.module.scss';
import { useTranslation } from 'react-i18next';

interface Props {
  text: string;
  readMoreLabel?: string;
  readLessLabel?: string;
  className?: string;
  textClassname?: string;
}

export function ExpandableText({ text, readMoreLabel, readLessLabel, className, textClassname }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textParagraphRef = useRef<HTMLParagraphElement>(null);

  const { t } = useTranslation('common');
  const readMoreLabelFinal = readLessLabel ? readMoreLabel : t('actions.read_more');
  const readLessLabelFinal = readLessLabel ? readLessLabel : t('actions.read_less');

  useEffect(() => {
    const elemement = textParagraphRef.current;
    // scrollHeight = total content height
    // clientHeight = height allowed by CSS (2 lines)
    if (elemement) {
      setIsTruncated(elemement.scrollHeight > elemement.clientHeight);
    }
  }, [text]);

  return (
    <div className={classNames(styles.ExpandableText, className)}>
      <p ref={textParagraphRef} className={classNames(styles.Description, { [styles.Expanded]: isExpanded }, textClassname)}>
        {text}
      </p>
      {(isTruncated || isExpanded) && (
        <button type="button" className={styles.ReadMoreButton} onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? readLessLabelFinal : readMoreLabelFinal}
        </button>
      )}
    </div>
  );
}
