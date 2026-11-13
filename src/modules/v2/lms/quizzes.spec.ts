import { scoreQuestion } from './quizzes.service';

const q = (type: string, correct: unknown[], points = 2) => ({
  type,
  correct: correct as never,
  points,
});

describe('scoreQuestion (testlarni avtomatik baholash)', () => {
  it('bitta javobli savol: faqat to‘g‘ri indeks ball oladi', () => {
    expect(scoreQuestion(q('single', [1]), 1)).toBe(2);
    expect(scoreQuestion(q('single', [1]), 0)).toBe(0);
    expect(scoreQuestion(q('single', [1]), [1])).toBe(2);
  });

  it('ko‘p javobli savol: tartibidan qat’i nazar to‘liq mos bo‘lishi kerak', () => {
    expect(scoreQuestion(q('multiple', [0, 2]), [2, 0])).toBe(2);
    expect(scoreQuestion(q('multiple', [0, 2]), [0])).toBe(0);
    expect(scoreQuestion(q('multiple', [0, 2]), [0, 1, 2])).toBe(0);
  });

  it('matnli savol: katta-kichik harf va bo‘shliqlarga e’tibor bermaydi', () => {
    expect(scoreQuestion(q('text', ['Toshkent']), '  toshkent ')).toBe(2);
    expect(scoreQuestion(q('text', ['Toshkent']), 'Samarqand')).toBe(0);
  });

  it('javobsiz matnli savol qo‘lda baholanadi (null)', () => {
    expect(scoreQuestion(q('text', []), 'erkin javob')).toBeNull();
  });

  it('javob berilmagan savol 0 ball', () => {
    expect(scoreQuestion(q('single', [0]), undefined)).toBe(0);
    expect(scoreQuestion(q('text', ['a']), '')).toBe(0);
  });
});
