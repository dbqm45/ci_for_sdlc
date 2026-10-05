# Pojęcia domenowe w Javie 21 — przetestowane implementacje

Skompilowane `javac --release 21 -Xlint:all -Werror` i przetestowane. Tu w jednym pliku dla zwięzłości —
w projekcie: **jeden typ najwyższego poziomu na plik**, pakiet per moduł/kontekst.
Przykłady z archetypów (ddd-archetypes): Money, Party, Availability (agregat segmentu z maszyną stanów i zdarzeniami).

```java
package archetypes;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Currency;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

// ===== Money.java — obiekt wartości (niezmienny, sam się waliduje) =====
record Money(BigDecimal amount, Currency currency) implements Comparable<Money> {
    Money {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        amount = amount.setScale(currency.getDefaultFractionDigits(), RoundingMode.HALF_UP);
    }

    static Money of(String amount, String currencyCode) {
        return new Money(new BigDecimal(amount), Currency.getInstance(currencyCode));
    }

    Money add(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    Money subtract(Money other) {
        requireSameCurrency(other);
        return new Money(amount.subtract(other.amount), currency);
    }

    /** Dzieli kwotę na części tak, by suma się zgadzała (reszta groszy do pierwszych części). */
    List<Money> allocate(int parts) {
        if (parts <= 0) throw new IllegalArgumentException("parts must be positive");
        BigDecimal unit = BigDecimal.ONE.movePointLeft(currency.getDefaultFractionDigits());
        BigDecimal minor = amount.movePointRight(currency.getDefaultFractionDigits());
        BigDecimal[] divRem = minor.divideAndRemainder(BigDecimal.valueOf(parts));
        int extra = divRem[1].abs().intValue();
        BigDecimal step = unit.multiply(BigDecimal.valueOf(divRem[1].signum()));
        List<Money> result = new ArrayList<>(parts);
        for (int i = 0; i < parts; i++) {
            BigDecimal base = divRem[0].movePointLeft(currency.getDefaultFractionDigits());
            result.add(new Money(i < extra ? base.add(step) : base, currency));
        }
        return result;
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return amount.compareTo(other.amount);
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("Different currencies: " + currency + " and " + other.currency);
        }
    }
}

// ===== Party.java — warianty jako sealed interface + recordy =====
record PartyId(String value) {
    PartyId { Objects.requireNonNull(value); }
}

sealed interface Party permits Person, Organization {
    PartyId id();
    Set<String> roles();

    default boolean hasRole(String role) {
        return roles().contains(role);
    }

    static String displayName(Party party) {
        return switch (party) {                 // wyczerpujący switch — kompilator pilnuje wariantów
            case Person p -> p.firstName() + " " + p.lastName();
            case Organization o -> o.name();
        };
    }
}

record Person(PartyId id, Set<String> roles, String firstName, String lastName) implements Party {
    Person { roles = Set.copyOf(roles); }
}

record Organization(PartyId id, Set<String> roles, String name, Optional<PartyId> parent) implements Party {
    Organization { roles = Set.copyOf(roles); }
}

// ===== Result.java — wynik operacji (sukces albo odrzucenie z powodem) =====
sealed interface Result<E, T> permits Result.Success, Result.Failure {
    record Success<E, T>(T value) implements Result<E, T> {}
    record Failure<E, T>(E error) implements Result<E, T> {}

    static <E, T> Result<E, T> success(T value) { return new Success<>(value); }
    static <E, T> Result<E, T> failure(E error) { return new Failure<>(error); }

    default boolean isSuccess() { return this instanceof Success; }
}

// ===== TimeSlot.java =====
record TimeSlot(Instant from, Instant to) {
    TimeSlot {
        if (!from.isBefore(to)) throw new IllegalArgumentException("from must be before to");
    }

    boolean overlaps(TimeSlot other) {
        return from.isBefore(other.to) && other.from.isBefore(to);
    }
}

// ===== ResourceAvailability.java — agregat (archetyp Availability, wariant segmentu) =====
record OwnerId(String value) {}

/** Maszyna stanów blokady. */
sealed interface Blockade permits Blockade.Free, Blockade.Blocked, Blockade.Disabled {
    record Free() implements Blockade {}
    record Blocked(OwnerId by) implements Blockade {}
    record Disabled(OwnerId by) implements Blockade {}
}

/** Zdarzenia domenowe — czas przeszły, niezmienne. */
sealed interface AvailabilityEvent permits ResourceBlocked, ResourceReleased, ResourceDisabled {}
record ResourceBlocked(String resourceId, OwnerId by) implements AvailabilityEvent {}
record ResourceReleased(String resourceId, OwnerId by) implements AvailabilityEvent {}
record ResourceDisabled(String resourceId, OwnerId by) implements AvailabilityEvent {}

enum Rejection { ALREADY_TAKEN, DISABLED, NOT_OWNER }

final class ResourceAvailability {
    private final String resourceId;
    private final TimeSlot segment;
    private Blockade blockade = new Blockade.Free();
    private long version;                                  // blokada optymistyczna
    private final List<AvailabilityEvent> pending = new ArrayList<>();

    ResourceAvailability(String resourceId, TimeSlot segment) {
        this.resourceId = Objects.requireNonNull(resourceId);
        this.segment = Objects.requireNonNull(segment);
    }

    Result<Rejection, AvailabilityEvent> block(OwnerId requester) {
        return switch (blockade) {
            case Blockade.Disabled d -> Result.failure(Rejection.DISABLED);
            case Blockade.Blocked b when !b.by().equals(requester) -> Result.failure(Rejection.ALREADY_TAKEN);
            default -> {
                blockade = new Blockade.Blocked(requester);
                yield Result.success(record(new ResourceBlocked(resourceId, requester)));
            }
        };
    }

    Result<Rejection, AvailabilityEvent> release(OwnerId requester) {
        return switch (blockade) {
            case Blockade.Disabled d -> Result.failure(Rejection.DISABLED);
            case Blockade.Blocked b when !b.by().equals(requester) -> Result.failure(Rejection.NOT_OWNER);
            default -> {
                blockade = new Blockade.Free();
                yield Result.success(record(new ResourceReleased(resourceId, requester)));
            }
        };
    }

    AvailabilityEvent disable(OwnerId requester) {
        blockade = new Blockade.Disabled(requester);
        return record(new ResourceDisabled(resourceId, requester));
    }

    List<AvailabilityEvent> pullEvents() {
        List<AvailabilityEvent> events = List.copyOf(pending);
        pending.clear();
        return events;
    }

    String resourceId() { return resourceId; }
    TimeSlot segment() { return segment; }
    long version() { return version; }

    private AvailabilityEvent record(AvailabilityEvent event) {
        pending.add(event);
        version++;
        return event;
    }
}

/** Repozytorium jako port w domenie; adapter (JPA, JDBC) w infrastrukturze. */
interface ResourceAvailabilityRepository {
    Optional<ResourceAvailability> find(String resourceId, TimeSlot segment);
    void save(ResourceAvailability availability);
}
```

## Testy (przypadki brzegowe)

```java
package archetypes;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public class DomainTest {
    static void eq(Object a, Object b, String msg) {
        if (!java.util.Objects.equals(a, b)) throw new AssertionError(msg + ": " + a + " != " + b);
    }

    public static void main(String[] args) {
        eq(Money.of("12.50", "PLN").add(Money.of("0.5", "PLN")), Money.of("13.00", "PLN"), "add");
        eq(Money.of("0.10", "PLN").add(Money.of("0.20", "PLN")), Money.of("0.30", "PLN"), "precise");
        eq(Money.of("100", "PLN").allocate(3).stream().map(m -> m.amount().toPlainString()).toList(),
           List.of("33.34", "33.33", "33.33"), "allocate");
        eq(Money.of("-100", "PLN").allocate(3).stream().map(m -> m.amount().toPlainString()).toList(),
           List.of("-33.34", "-33.33", "-33.33"), "allocate negative");
        boolean threw = false;
        try { Money.of("1", "PLN").add(Money.of("1", "EUR")); } catch (IllegalArgumentException e) { threw = true; }
        eq(threw, true, "currency mismatch");

        Party org = new Organization(new PartyId("p1"), Set.of("CUSTOMER", "SUPPLIER"), "ACME", Optional.empty());
        eq(Party.displayName(org), "ACME", "party name");
        eq(org.hasRole("SUPPLIER"), true, "role");

        Instant t = Instant.parse("2026-01-01T10:00:00Z");
        TimeSlot a = new TimeSlot(t, t.plusSeconds(7200)), b = new TimeSlot(t.plusSeconds(3600), t.plusSeconds(10800));
        eq(a.overlaps(b), true, "overlap");
        eq(a.overlaps(new TimeSlot(t.plusSeconds(7200), t.plusSeconds(9000))), false, "touching");

        var ra = new ResourceAvailability("car-1", a);
        OwnerId alice = new OwnerId("alice"), bob = new OwnerId("bob");
        eq(ra.block(alice).isSuccess(), true, "block");
        eq(ra.block(bob), Result.failure(Rejection.ALREADY_TAKEN), "taken");
        eq(ra.release(bob), Result.failure(Rejection.NOT_OWNER), "not owner");
        eq(ra.release(alice).isSuccess(), true, "release");
        ra.disable(bob);
        eq(ra.block(bob), Result.failure(Rejection.DISABLED), "disabled");
        eq(ra.pullEvents().stream().map(e -> e.getClass().getSimpleName()).toList(),
           List.of("ResourceBlocked", "ResourceReleased", "ResourceDisabled"), "events");
        eq(ra.pullEvents().isEmpty(), true, "drained");
        System.out.println("OK: all archetype Java tests passed");
    }
}
```
