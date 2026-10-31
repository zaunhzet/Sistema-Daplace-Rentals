export interface LiquidationSummary {
  totalIngresos: number;
  totalGastos: number;
  balanceNeto: number;
  garantiasEnCustodia: number;
  cantidadPagosConciliados: number;
  cantidadGastosAprobados: number;
}

export interface LiquidationIncomeItem {
  pagoId: string;
  reservaId: string;
  fechaPago: string;
  concepto: string;
  metodoPago: string;
  referenciaOperacion: string;
  monto: number;
}

export interface LiquidationExpenseItem {
  gastoId: string;
  fechaGasto: string;
  titulo: string;
  categoria: string;
  pagadoPor: string;
  monto: number;
}

export interface LiquidationGuaranteeItem {
  garantiaId: string;
  reservaId: string;
  estado: string;
  monto: number;
}

export interface LiquidationReport {
  propiedad: {
    id: string;
    nombre: string;
    direccion: string;
    propietarioId: string;
    propietarioNombre: string;
    moneda: string;
  };
  periodo: {
    mes: number;
    anio: number;
    etiqueta: string;
  };
  moneda: string;
  resumen: LiquidationSummary;
  ingresos: LiquidationIncomeItem[];
  gastos: LiquidationExpenseItem[];
  garantias: LiquidationGuaranteeItem[];
}

export interface LiquidationFilterParams {
  propiedadId: string;
  mes: number;
  anio: number;
}
