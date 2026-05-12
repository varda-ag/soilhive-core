export const EDITOR_HEADER = (
  <>
    <span className="ql-formats">
      <select className="ql-header" defaultValue="">
        <option value="2">Heading</option>
        <option value="3">Subheading</option>
        <option value="">Normal</option>
      </select>
    </span>
    <span className="ql-formats">
      <button className="ql-bold" />
      <button className="ql-italic" />
      <button className="ql-underline" />
    </span>
    <span className="ql-formats">
      <button className="ql-list" value="ordered" type="button" />
      <button className="ql-list" value="bullet" type="button" />
    </span>
    <span className="ql-formats">
      <select className="ql-color" />
    </span>
    <span className="ql-formats">
      <button className="ql-link" />
    </span>
  </>
);
