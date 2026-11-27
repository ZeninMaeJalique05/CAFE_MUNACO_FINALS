{NAV[user.role].map((item) => (
  <NavLink key={item.to} to={item.to} end={item.end ?? false}>
    <Icon name={item.icon} />
    {item.label}
  </NavLink>
))}