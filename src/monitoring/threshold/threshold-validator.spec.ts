import { ThresholdValidator, ThresholdValidationError } from './threshold-validator';

describe('ThresholdValidator', () => {
  const validator = new ThresholdValidator();

  describe('validate', () => {
    it('acepta valor válido para greater_than', () => {
      const result = validator.validate({
        conditionType: 'greater_than',
        thresholdValueMin: 25,
        thresholdValueMax: null,
      });
      expect(result).toEqual({
        min: 25,
        max: null,
        conditionType: 'greater_than',
      });
    });

    it('rechaza valor null cuando se requiere min (greater_than)', () => {
      expect(() =>
        validator.validate({
          conditionType: 'greater_than',
          thresholdValueMin: null,
          thresholdValueMax: null,
        }),
      ).toThrow(ThresholdValidationError);
      expect(() =>
        validator.validate({
          conditionType: 'greater_than',
          thresholdValueMin: null,
          thresholdValueMax: null,
        }),
      ).toThrow('Debes indicar el valor del límite');
    });

    it('rechaza valor fuera de rango realista (1e12+)', () => {
      expect(() =>
        validator.validate({
          conditionType: 'greater_than',
          thresholdValueMin: 1e13,
          thresholdValueMax: null,
        }),
      ).toThrow(ThresholdValidationError);
      expect(() =>
        validator.validate({
          conditionType: 'greater_than',
          thresholdValueMin: 1e13,
          thresholdValueMax: null,
        }),
      ).toThrow('fuera de rango realista');
    });

    it('rechaza conditionType inválido', () => {
      expect(() =>
        validator.validate({
          conditionType: 'invalid_type',
          thresholdValueMin: 10,
          thresholdValueMax: null,
        }),
      ).toThrow(ThresholdValidationError);
      expect(() =>
        validator.validate({
          conditionType: 'invalid_type',
          thresholdValueMin: 10,
          thresholdValueMax: null,
        }),
      ).toThrow('Condición inválida');
    });

    it('rechaza umbrales conflictivos (min > max en out_of_range)', () => {
      expect(() =>
        validator.validate({
          conditionType: 'out_of_range',
          thresholdValueMin: 100,
          thresholdValueMax: 50,
        }),
      ).toThrow(ThresholdValidationError);
      expect(() =>
        validator.validate({
          conditionType: 'out_of_range',
          thresholdValueMin: 100,
          thresholdValueMax: 50,
        }),
      ).toThrow('mínimo no puede ser mayor al máximo');
    });

    it('acepta rango válido para out_of_range', () => {
      const result = validator.validate({
        conditionType: 'out_of_range',
        thresholdValueMin: 10,
        thresholdValueMax: 90,
      });
      expect(result).toEqual({
        min: 10,
        max: 90,
        conditionType: 'out_of_range',
      });
    });

    it('acepta string numérico como entrada', () => {
      const result = validator.validate({
        conditionType: 'less_than',
        thresholdValueMin: '30',
        thresholdValueMax: null,
      });
      expect(result.min).toBe(30);
    });

    it('rechaza out_of_range con min null', () => {
      expect(() =>
        validator.validate({
          conditionType: 'out_of_range',
          thresholdValueMin: null,
          thresholdValueMax: 100,
        }),
      ).toThrow('Para "fuera de rango" debes indicar mínimo y máximo');
    });

    it('acepta equal_to con min=0', () => {
      const result = validator.validate({
        conditionType: 'equal_to',
        thresholdValueMin: 0,
        thresholdValueMax: null,
      });
      expect(result.min).toBe(0);
      expect(result.max).toBeNull();
    });
  });
});
