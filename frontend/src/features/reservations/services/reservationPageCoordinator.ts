import type { Reservation, ReservationFilterParams } from '../types.js';
import type { Property } from '../../properties/types.js';
import type { Guest } from '../../guests/types.js';

export interface ReservationsPageCoordinatorServices {
  getReservations: (filters?: ReservationFilterParams) => Promise<Reservation[]>;
  getProperties: () => Promise<Property[]>;
  getGuests: () => Promise<Guest[]>;
  getReservationById: (id: string) => Promise<Reservation | null>;
}

export interface ReservationsPageCoordinatorHandlers {
  setReservations: (r: Reservation[]) => void;
  setProperties: (p: Property[]) => void;
  setGuests: (g: Guest[]) => void;
  setSelectedReservation: (r: Reservation | null) => void;
  setLoading: (l: boolean) => void;
  showError: (msg: string) => void;
  getSelectedReservation: () => Reservation | null;
}

export function createReservationsPageCoordinator(
  services: ReservationsPageCoordinatorServices,
  handlers: ReservationsPageCoordinatorHandlers
) {
  let fetchGen = 0;

  return {
    getFetchGen: () => fetchGen,
    async loadData(filters?: ReservationFilterParams, silent = false): Promise<void> {
      const currentGen = ++fetchGen;
      if (!silent) handlers.setLoading(true);

      const activeSelected = handlers.getSelectedReservation();
      const activeSelectedId = activeSelected?.id;

      try {
        const [resData, propsData, guestsData, freshDetail] = await Promise.all([
          services.getReservations(filters),
          services.getProperties(),
          services.getGuests(),
          activeSelectedId
            ? services.getReservationById(activeSelectedId).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (currentGen !== fetchGen) return;

        handlers.setReservations(resData);
        handlers.setProperties(propsData);
        handlers.setGuests(guestsData);

        if (freshDetail && handlers.getSelectedReservation()?.id === freshDetail.id) {
          handlers.setSelectedReservation(freshDetail);
        }
      } catch (err: unknown) {
        if (currentGen !== fetchGen) return;
        if (err instanceof Error) {
          handlers.showError(err.message);
        } else {
          handlers.showError('Error al consultar reservas.');
        }
      } finally {
        if (currentGen === fetchGen) {
          handlers.setLoading(false);
        }
      }
    },
  };
}

export interface CalendarPageCoordinatorServices {
  getMonthDays: (propertyId: string, year: number, month: number) => Promise<any[]>;
  getMonthSummary: (days: any[]) => any;
  getReservationById?: (id: string) => Promise<Reservation | null>;
}

export interface CalendarPageCoordinatorHandlers {
  setDays: (days: any[]) => void;
  setSummary: (summary: any) => void;
  setLoading: (l: boolean) => void;
  showError?: (msg: string) => void;
  getSelectedReservation?: () => Reservation | null;
  setSelectedReservation?: (r: Reservation | null) => void;
}

export function createCalendarPageCoordinator(
  services: CalendarPageCoordinatorServices,
  handlers: CalendarPageCoordinatorHandlers
) {
  let calendarGen = 0;

  return {
    getCalendarGen: () => calendarGen,
    async loadCalendar(propertyId: string, year: number, month: number, silent = false): Promise<void> {
      const currentGen = ++calendarGen;
      if (!silent) handlers.setLoading(true);

      const activeSelected = handlers.getSelectedReservation?.();
      const activeSelectedId = activeSelected?.id;

      try {
        const [monthDays, freshDetail] = await Promise.all([
          services.getMonthDays(propertyId, year, month),
          activeSelectedId && services.getReservationById
            ? services.getReservationById(activeSelectedId).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (currentGen !== calendarGen) return;

        handlers.setDays(monthDays);
        handlers.setSummary(services.getMonthSummary(monthDays));

        const currentSelected = handlers.getSelectedReservation?.();
        if (
          currentSelected &&
          freshDetail &&
          currentSelected.id === activeSelectedId &&
          freshDetail.id === activeSelectedId &&
          handlers.setSelectedReservation
        ) {
          handlers.setSelectedReservation(freshDetail);
        }
      } catch (err: unknown) {
        if (currentGen !== calendarGen) return;
        handlers.showError?.(err instanceof Error ? err.message : 'Error al cargar calendario.');
      } finally {
        if (currentGen === calendarGen) {
          handlers.setLoading(false);
        }
      }
    },
  };
}
