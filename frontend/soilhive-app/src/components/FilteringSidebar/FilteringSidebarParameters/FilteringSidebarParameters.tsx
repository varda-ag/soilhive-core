import { Accordion, NestedCheckbox, SelectionPills, Toggle } from 'components/UI';
import { collectParentsIds, filterNestedItems } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import type { NestedCheckboxRef } from 'types/components';
import useSoilPropertiesFilters from 'hooks/useSoilPropertiesFilters';

import styles from './FilteringSidebarParameters.module.scss';

export function FilteringSidebarParameters() {
  const {
    isLoading,
    isNoData,
    isNoFilteredData,
    nestedSoilProperties,
    selectedSoilProperties,
    pillSelections,
    handleOnChange,
    handlePillRemove,
  } = useSoilPropertiesFilters();

  const [soilPropertiesExpanded, setSoilPropertiesExpanded] = useState(false);
  const soilPropertiesRef = useRef<NestedCheckboxRef>(null);

  const parentProperties = useMemo((): string[] => {
    return collectParentsIds(nestedSoilProperties);
  }, [nestedSoilProperties]);

  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleSearch = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setSoilPropertiesExpanded(true);
    soilPropertiesRef.current?.expandAll();
  }, []);

  const handleProperitesExpansionToggle = useCallback(() => {
    if (soilPropertiesExpanded) {
      soilPropertiesRef.current?.collapseAll();
    } else {
      soilPropertiesRef.current?.expandAll();
    }
    setSoilPropertiesExpanded(!soilPropertiesExpanded);
  }, [soilPropertiesExpanded]);

  const handleToggleVisibility = useCallback(
    (expandedIds: string[]) => {
      const allExpanded = parentProperties.every(item => expandedIds.includes(item));
      if (allExpanded && !soilPropertiesExpanded) {
        setSoilPropertiesExpanded(true);
      }

      if (!allExpanded && soilPropertiesExpanded) {
        setSoilPropertiesExpanded(false);
      }
    },
    [parentProperties, soilPropertiesExpanded],
  );

  const filteredProperties = useMemo(() => filterNestedItems(nestedSoilProperties, searchTerm), [nestedSoilProperties, searchTerm]);

  return (
    <div className={styles.FilteringSidebarParameters}>
      <Accordion
        title="Soil Properties"
        type="secondary"
        pillsSlot={pillSelections.length > 0 ? <SelectionPills selections={pillSelections} onRemove={handlePillRemove} /> : null}
      >
        {!isNoData && !isNoFilteredData && (
          <div className={styles.SoilProperties}>
            <input
              type="text"
              placeholder="Search soil properties"
              value={searchTerm}
              onChange={handleSearch}
              className={styles.SearchInput}
            />
            <Toggle
              labelOne="Expand All"
              labelTwo="Collapse All"
              isToggled={soilPropertiesExpanded}
              onToggle={handleProperitesExpansionToggle}
            />
            {isLoading ? (
              <span data-testid="skeleton-container">
                <Skeleton count={1} height={120} />
              </span>
            ) : (
              <NestedCheckbox
                ref={soilPropertiesRef}
                className={styles.SoilPropertiesCheckbox}
                items={filteredProperties}
                selected={selectedSoilProperties}
                onChange={handleOnChange}
                onToggleVisibility={handleToggleVisibility}
              />
            )}
          </div>
        )}
      </Accordion>
    </div>
  );
}
