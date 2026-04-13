import { create } from 'zustand';

export type TableStatusType = 'EMPTY' | 'HOLD' | 'SENT' | 'BILL_REQUESTED' | 'LOCKED';

export type TableStatus = {
  section: string;
  tableNo: string;
  orderId: string;
  startTime: number;
  status: TableStatusType;
  lockedByName?: string;  // Name of person/customer who locked the table
  totalAmount?: number;
};

type TableStatusState = {
  tables: TableStatus[];
  lockedTables: string[]; // Store table IDs that are locked
  lockedTableNames: Record<string, string>; // Map tableNo to locked person name
  updateTableStatus: (
    section: string,
    tableNo: string,
    orderId: string,
    status: TableStatusType,
    startTime?: number,
    lockedByName?: string,
    totalAmount?: number
  ) => void;
  clearTable: (section: string, tableNo: string) => void;
  lockTable: (tableId: string, lockedByName?: string) => void;
  unlockTable: (tableId: string) => void;
  isTableLocked: (tableId: string) => boolean;
  getLockedName: (tableNo: string, section?: string) => string | undefined;
  setLockedName: (tableNo: string, name: string) => void;
  syncLockedTables: (lockedTables: Array<{ tableNo: string; section: string; lockedByName?: string }>) => void;
  getTables: () => TableStatus[];
};

export const useTableStatusStore = create<TableStatusState>((set, get) => ({
  tables: [],
  lockedTables: [],
  lockedTableNames: {},

  updateTableStatus: (section, tableNo, orderId, status, startTime, lockedByName, totalAmount) => {
    set((state) => {
      const existingIndex = state.tables.findIndex(
        (t) => t.section === section && t.tableNo === tableNo
      );

      const newState = { ...state };
      if (status === 'LOCKED' && lockedByName) {
        newState.lockedTableNames = { ...state.lockedTableNames, [tableNo]: lockedByName };
      } else if (status !== 'LOCKED') {
        const { [tableNo]: _, ...rest } = newState.lockedTableNames;
        newState.lockedTableNames = rest;
      }

      if (existingIndex > -1) {
        const updatedTables = [...state.tables];
        updatedTables[existingIndex] = {
          ...updatedTables[existingIndex],
          orderId,
          status,
          startTime: startTime || updatedTables[existingIndex].startTime,
          lockedByName,
          totalAmount: totalAmount !== undefined ? totalAmount : updatedTables[existingIndex].totalAmount,
        };
        return { ...newState, tables: updatedTables };
      } else {
        return {
          ...newState,
          tables: [
            ...state.tables,
            {
              section,
              tableNo,
              orderId,
              startTime: startTime || Date.now(),
              status,
              lockedByName,
              totalAmount,
            },
          ],
        };
      }
    });
  },

  clearTable: (section, tableNo) => {
    set((state) => {
      const { [tableNo]: _, ...rest } = state.lockedTableNames;
      return {
        tables: state.tables.filter(
          (t) => !(t.section === section && t.tableNo === tableNo)
        ),
        lockedTableNames: rest,
      };
    });
  },

  lockTable: (tableId, lockedByName) => {
    set((state) => {
      if (!state.lockedTables.includes(tableId)) {
        const newState: any = { lockedTables: [...state.lockedTables, tableId] };
        if (lockedByName) {
          newState.lockedTableNames = { ...state.lockedTableNames, [tableId]: lockedByName };
        }
        return newState;
      }
      return state;
    });
  },

  unlockTable: (tableId) => {
    set((state) => {
      const { [tableId]: _, ...rest } = state.lockedTableNames;
      return {
        lockedTables: state.lockedTables.filter((id) => id !== tableId),
        lockedTableNames: rest,
      };
    });
  },

  isTableLocked: (tableId) => {
    return get().lockedTables.includes(tableId);
  },

  getLockedName: (tableNo, section) => {
    const normalize = (n: any) => n?.toString().replace(/^T/i, "").trim();
    const sTableNo = normalize(tableNo);

    if (section) {
      const name = get().lockedTableNames[`${section}_${sTableNo}`] || get().lockedTableNames[`${section}_${tableNo}`];
      if (name) return name;
    }

    // Fallback search in tables array
    const table = get().tables.find(t => 
      (normalize(t.tableNo) === sTableNo || t.tableNo === tableNo) && 
      (!section || t.section === section)
    );
    return table?.lockedByName;
  },

  setLockedName: (tableNo, name) => {
    set((state) => ({
      lockedTableNames: { ...state.lockedTableNames, [tableNo]: name },
    }));
  },

  syncLockedTables: (lockedList) => {
    set((state) => {
      const lockedMap: Record<string, { name: string; section: string }> = {};
      lockedList.forEach((t) => {
        const key = `${t.section}_${t.tableNo}`;
        lockedMap[key] = { name: t.lockedByName || "", section: t.section };
      });

      // 1. Update existing tables in state
      const updatedTables = state.tables.map((t) => {
        const key = `${t.section}_${t.tableNo}`;
        const lockedData = lockedMap[key];
        if (lockedData !== undefined) {
          return { ...t, status: "LOCKED" as TableStatusType, lockedByName: lockedData.name };
        } else if (t.status === "LOCKED") {
          return { ...t, status: "EMPTY" as TableStatusType, lockedByName: undefined };
        }
        return t;
      });

      // 2. Add tables that are locked but were not in the store (they were "empty")
      lockedList.forEach((lockedItem) => {
        const exists = updatedTables.find(t => t.tableNo === lockedItem.tableNo && t.section === lockedItem.section);
        if (!exists) {
          updatedTables.push({
            section: lockedItem.section,
            tableNo: lockedItem.tableNo,
            orderId: "RESERVED",
            startTime: Date.now(),
            status: "LOCKED",
            lockedByName: lockedItem.lockedByName
          });
        }
      });

      // Cleanup: Remove any "EMPTY" tables from the store to keep it clean (only active ones stay)
      const finalTables = updatedTables.filter(t => t.status !== 'EMPTY');

      const nameMap: Record<string, string> = {};
      lockedList.forEach(t => {
        const key = `${t.section}_${t.tableNo}`;
        nameMap[key] = t.lockedByName || "";
      });

      return {
        tables: finalTables,
        lockedTableNames: { ...state.lockedTableNames, ...nameMap },
      };
    });
  },

  getTables: () => get().tables,
}));

// Legacy wrappers for compatibility if needed, but components should use useTableStatusStore
export const getTables = () => useTableStatusStore.getState().getTables();
export const updateTableStatus = (
  section: string,
  tableNo: string,
  orderId: string,
  status: TableStatusType,
  startTime?: number,
  lockedByName?: string,
  totalAmount?: number
) => useTableStatusStore.getState().updateTableStatus(section, tableNo, orderId, status, startTime, lockedByName, totalAmount);
export const clearTable = (section: string, tableNo: string) => 
  useTableStatusStore.getState().clearTable(section, tableNo);

export const setTableActive = (
  section: string,
  tableNo: string,
  orderId: string,
) => {
  updateTableStatus(section, tableNo, orderId, 'SENT', Date.now());
};

export const setTableHold = (
  section: string,
  tableNo: string,
  orderId: string,
) => {
  updateTableStatus(section, tableNo, orderId, 'HOLD', Date.now());
};

