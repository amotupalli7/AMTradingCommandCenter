import Input from './ui/Input';
import Select from './ui/Select';
import TextArea from './ui/TextArea';
import Badge from './ui/Badge';
import { GRADE_OPTIONS, TEMP_OPTIONS } from '../constants';

export default function DailyHeader({ header, onUpdate, readOnly }) {
  const u = (field) => (value) => {
    if (!readOnly) onUpdate(field, value);
  };

  return (
    <div className="daily-header">
      <div className="header-row">
        <Input label="X Score" value={header.xScore} onChange={u('xScore')} placeholder="e.g. 7.5" readOnly={readOnly} />
        <Select label="Grade" value={header.grade} onChange={u('grade')} options={GRADE_OPTIONS} placeholder="End of day" />
      </div>

      <div className="header-row">
        <Input label="Weekly Goal" value={header.weeklyGoal} onChange={u('weeklyGoal')} placeholder="Persists from day to day..." readOnly={readOnly} />
        <Input label="Daily Goal" value={header.dailyGoal} onChange={u('dailyGoal')} placeholder="Today's focus..." readOnly={readOnly} />
      </div>

      <TextArea
        label="Reminders / Aphorisms"
        value={header.reminders}
        onChange={u('reminders')}
        placeholder="Personal reminders (auto-copied from previous day)..."
        rows={3}
        readOnly={readOnly}
      />

      <div className="temp-section">
        <div className="temp-row">
          <div className="temp-group">
            <label className="field-label">Temp Before</label>
            <div className="temp-badges">
              {TEMP_OPTIONS.map(opt => (
                <Badge key={opt} active={header.tempBefore === opt} onClick={() => u('tempBefore')(opt)}>
                  {opt}
                </Badge>
              ))}
            </div>
          </div>
          <Input value={header.tempBeforeComments} onChange={u('tempBeforeComments')} placeholder="Brief note..." readOnly={readOnly} />
        </div>

        <div className="temp-row">
          <div className="temp-group">
            <label className="field-label">Temp During</label>
            <div className="temp-badges">
              {TEMP_OPTIONS.map(opt => (
                <Badge key={opt} active={header.tempDuring === opt} onClick={() => u('tempDuring')(opt)}>
                  {opt}
                </Badge>
              ))}
            </div>
          </div>
          <Input value={header.tempDuringComments} onChange={u('tempDuringComments')} placeholder="Brief note..." readOnly={readOnly} />
        </div>

        <div className="temp-row">
          <div className="temp-group">
            <label className="field-label">Temp After</label>
            <div className="temp-badges">
              {TEMP_OPTIONS.map(opt => (
                <Badge key={opt} active={header.tempAfter === opt} onClick={() => u('tempAfter')(opt)}>
                  {opt}
                </Badge>
              ))}
            </div>
          </div>
          <Input value={header.tempAfterComments} onChange={u('tempAfterComments')} placeholder="Brief note..." readOnly={readOnly} />
        </div>
      </div>

      <TextArea
        label="Overview"
        value={header.overview}
        onChange={u('overview')}
        placeholder="General market/session overview..."
        rows={3}
        readOnly={readOnly}
      />
    </div>
  );
}
