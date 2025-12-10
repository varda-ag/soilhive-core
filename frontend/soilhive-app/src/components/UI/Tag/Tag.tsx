import classnames from 'classnames';
import { useMemo } from 'react';

import styles from './Tag.module.scss';

type TagType = 'default' | 'primary';

interface Props {
    text: string;
    type?: TagType;
}

export function Tag({
    text,
    type = 'default'
}: Props) {

    const typeClass = useMemo(
        () =>
            ({
                default: styles.Default,
                primary: styles.Primary,
            }[type]),
        [type]
    )

    return (
        <span
            data-testid="sh-ui-tag"
            className={classnames(styles.Tag, typeClass)}
        >
            {text}
        </span>
    );
};

